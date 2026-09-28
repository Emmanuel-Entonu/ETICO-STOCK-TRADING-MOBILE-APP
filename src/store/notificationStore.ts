import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { PacOrderListItem } from '@/lib/pacApi'
import { naira } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { notifyOrderFilled } from '@/lib/pushNotifications'

// In-app notification centre.
//
// Two sources, merged newest-first:
//  • SERVER — public.notifications, written by the backend for account/money
//    events (CSCS approved/rejected, deposit received, wallet funded). The same
//    events are pushed to every device. read_at lives on the server, so marking
//    one seen marks it seen on every device and after a reinstall.
//  • LOCAL  — order fills / cancellations derived from PAC orders, plus the KYC
//    status items (not started / under review / rejected → redo).
//
// Read state: every id the user has read is kept in `readIds`, SEPARATE from the
// item list. The list is rebuilt on each sync — and on app open Home syncs before
// the orders have loaded — so storing read flags only on the items lost them and
// already-read notifications lit up again on every launch.
//
// No floods: the first sync for an account marks all existing history as read
// (a new device or reinstall doesn't dump old orders as "new"), and pending
// orders no longer produce an item each. State is scoped to the signed-in user.

export type NotifType = 'trade' | 'account' | 'money' | 'system'

export interface Notif {
  id: string
  type: NotifType
  title: string
  body: string
  createdAt: string      // ISO
  read: boolean
  route?: string         // where tapping should take the user
  serverId?: string      // set for server-side notifications
}

interface AccountStatus {
  kycStatus?: string | null
  cacsStatus?: string | null
  cacsRejectionReason?: string | null
}

interface NotifState {
  userId: string | null
  items: Notif[]            // LOCAL derived items
  server: Notif[]           // SERVER items (read = read_at set)
  dismissed: string[]
  seeded: boolean           // first sync for this user done (history marked read)
  seededAt: string | null   // when that first sync ran, older trade items are history
  readIds: string[]         // every id read on this device (survives list rebuilds)
  pendingSeen: string[]     // order ids seen while pending → fill notifications
  lastServerFetch: number
  markRead: (id: string) => void
  markAllRead: () => void
  remove: (id: string) => void
  clearAll: () => void
  refreshServer: (force?: boolean) => Promise<void>
  sync: (orders: PacOrderListItem[], status: AccountStatus) => void
  reset: () => void
  unread: () => number
  /** Merged, visible list for the UI. */
  all: () => Notif[]
}

const READ_CAP = 600
const addRead = (ids: string[], add: string[]) => Array.from(new Set([...ids, ...add])).slice(-READ_CAP)

// Short stable hash so a NEW rejection reason produces a new (unread) item.
const shortHash = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

// Zustand persist loads from AsyncStorage asynchronously. Syncing before that
// finishes treated the device as fresh and overwrote the saved read state.
const hydrated = () => new Promise<void>((resolve) => {
  const p = useNotificationStore.persist
  if (p.hasHydrated()) return resolve()
  const unsub = p.onFinishHydration(() => { unsub(); resolve() })
})

// accountCreatedAt dates the welcome item to when the account was actually
// created. KYC items get their date from when this device first saw that state
// (preserved across syncs in `sync`), not a fixed/fake date.
function derive(orders: PacOrderListItem[], status: AccountStatus, accountCreatedAt: string): Notif[] {
  const out: Notif[] = []
  const now = new Date().toISOString()
  out.push({
    id: 'sys:welcome', type: 'system',
    title: 'Welcome to ETICO',
    body: 'Ethical investing on the Nigerian Exchange. Your updates will show up here.',
    createdAt: accountCreatedAt, read: true,
  })

  const kyc = status.kycStatus ?? 'pending'
  const cacs = status.cacsStatus ?? 'not_submitted'
  if (cacs === 'rejected' || kyc === 'rejected') {
    const reason = (status.cacsRejectionReason ?? '').split('•').map(s => s.trim()).filter(Boolean)[0]
    out.push({
      id: `acct:kyc-rejected:${shortHash(status.cacsRejectionReason ?? '')}`, type: 'account',
      title: 'Verification unsuccessful: redo your KYC',
      body: reason
        ? `We couldn’t verify your account: ${reason}. Tap to fix it and resubmit.`
        : 'We couldn’t verify your account. Tap to see why, fix it and resubmit.',
      createdAt: now, read: false, route: '/(auth)/kyc',
    })
  } else if (kyc === 'pending' || kyc === 'skipped') {
    out.push({
      id: 'acct:kyc', type: 'account',
      title: 'Verify your identity to start investing',
      body: 'It takes about 5 minutes with your BVN. Once submitted, we review it, usually within 1–2 business days.',
      createdAt: accountCreatedAt, read: false, route: '/(auth)/kyc',
    })
  } else if ((kyc === 'submitted' || kyc === 'verified') && cacs !== 'approved') {
    out.push({
      id: 'acct:kyc-review', type: 'account',
      title: 'Your details are under review',
      body: 'Thanks for submitting your KYC. Reviews usually take 1–2 business days. We’ll let you know as soon as your account is approved.',
      createdAt: now, read: false,
    })
  }

  for (const o of orders.slice(0, 30)) {
    const s = (o.orderStatus ?? '').toUpperCase()
    const side = o.side === 'BUY' ? 'buy' : 'sell'
    const qty = o.filledQty || o.requestedQty
    const when = o.updatedAt || o.createdAt || now
    const base = { type: 'trade' as const, createdAt: when, read: false, route: `/receipt/${o.id}` }
    if (s === 'FILLED') {
      out.push({ ...base, id: `order:${o.id}:filled`, title: `Order filled: ${o.secId}`,
        body: `Your ${side} of ${qty.toLocaleString()} ${o.secId} is complete (${naira(o.totalValue)}).` })
    } else if (s.includes('CANCEL')) {
      out.push({ ...base, id: `order:${o.id}:cancelled`, title: `Order cancelled: ${o.secId}`,
        body: `Your ${side} order for ${o.secId} was cancelled.` })
    }
  }
  return out
}

const currentUserId = async () => (await supabase.auth.getSession()).data.session?.user?.id ?? null
const currentUserCreatedAt = async () => (await supabase.auth.getSession()).data.session?.user?.created_at ?? new Date().toISOString()

export const useNotificationStore = create<NotifState>()(
  persist(
    (set, get) => ({
      userId: null,
      items: [],
      server: [],
      dismissed: [],
      seeded: false,
      seededAt: null,
      readIds: [],
      pendingSeen: [],
      lastServerFetch: 0,

      markRead: (id) => {
        const srv = get().server.find(n => n.id === id)
        set(s => ({
          readIds: addRead(s.readIds, [id]),
          items: s.items.map(n => n.id === id ? { ...n, read: true } : n),
          server: s.server.map(n => n.id === id ? { ...n, read: true } : n),
        }))
        if (srv?.serverId && !srv.read) {
          supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', srv.serverId)
            .then(({ error }) => { if (error) console.warn('[notifications] mark read failed:', error.message) })
        }
      },
      markAllRead: () => {
        const hadUnreadServer = get().server.some(n => !n.read)
        set(s => ({
          readIds: addRead(s.readIds, [...s.items, ...s.server].map(n => n.id)),
          items: s.items.map(n => ({ ...n, read: true })),
          server: s.server.map(n => ({ ...n, read: true })),
        }))
        if (hadUnreadServer) {
          supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
            .then(({ error }) => { if (error) console.warn('[notifications] mark all read failed:', error.message) })
        }
      },
      // Delete = hide on this device and mark read (so it isn't "new" anywhere).
      remove: (id) => {
        get().markRead(id)
        set(s => ({
          items: s.items.filter(n => n.id !== id),
          dismissed: s.dismissed.includes(id) ? s.dismissed : [...s.dismissed, id].slice(-300),
        }))
      },
      clearAll: () => {
        get().markAllRead()
        const ids = get().all().map(n => n.id)
        set(s => ({ items: [], dismissed: Array.from(new Set([...s.dismissed, ...ids])).slice(-300) }))
      },

      refreshServer: async (force = false) => {
        const now = Date.now()
        if (!force && now - get().lastServerFetch < 20_000) return
        set({ lastServerFetch: now })
        await hydrated()
        const uid = await currentUserId()
        if (!uid) return
        if (get().userId && get().userId !== uid) get().reset()
        const { data, error } = await supabase
          .from('notifications')
          .select('id, type, title, body, route, created_at, read_at')
          .order('created_at', { ascending: false })
          .limit(50)
        if (error || !data) return
        const read = new Set(get().readIds)
        set({
          userId: uid,
          server: data.map((r) => ({
            id: `srv:${r.id}`, serverId: r.id as string,
            type: ((r.type as string) ?? 'account') as NotifType,
            title: r.title as string, body: r.body as string,
            route: (r.route as string | null) ?? undefined,
            // Read if the server says so OR this device already marked it
            // (covers a mark-read write that hasn't landed or failed).
            createdAt: r.created_at as string, read: !!r.read_at || read.has(`srv:${r.id}`),
          })),
        })
      },

      sync: (orders, status) => {
        void (async () => {
          await hydrated()
          const uid = await currentUserId()
          if (!uid) return
          if (get().userId !== uid) { get().reset(); set({ userId: uid }) }
          const accountCreatedAt = await currentUserCreatedAt()

          // Everything below reads state fresh AFTER the awaits, so a tap that
          // happened meanwhile is never overwritten.
          const prev = new Map(get().items.map(n => [n.id, n]))
          const pendingSeen = new Set(get().pendingSeen)

          // Pending → filled transition seen on THIS device → tray notification.
          for (const o of orders.slice(0, 30)) {
            const s = (o.orderStatus ?? '').toUpperCase()
            if (s === 'FILLED') {
              if (pendingSeen.has(o.id) && !prev.has(`order:${o.id}:filled`)) {
                notifyOrderFilled({ side: o.side, symbol: o.secId, qty: o.filledQty || o.requestedQty, total: o.totalValue, orderId: o.id })
              }
              pendingSeen.delete(o.id)
            } else if (!s.includes('CANCEL') && !s.includes('REJECT')) {
              pendingSeen.add(o.id)
            } else {
              pendingSeen.delete(o.id)
            }
          }

          const firstRun = !get().seeded
          const seededAt = get().seededAt ?? new Date().toISOString()
          const readIds = new Set(get().readIds)
          const derived = derive(orders, status, accountCreatedAt).map(d => {
            const existing = prev.get(d.id)
            // KYC items keep the date this device first showed them.
            const createdAt = d.type === 'account' && existing ? existing.createdAt : d.createdAt
            const history = d.type === 'trade' && (firstRun || d.createdAt <= seededAt)
            return { ...d, createdAt, read: d.read || readIds.has(d.id) || !!existing?.read || history }
          })
          // Orders load after the first paint: an empty order list must not
          // wipe trade items already shown — keep them until PAC answers.
          const derivedIds = new Set(derived.map(d => d.id))
          const keptTrades = orders.length === 0
            ? [...prev.values()].filter(n => n.type === 'trade' && !derivedIds.has(n.id))
            : []
          set({
            items: [...derived, ...keptTrades],
            seeded: true,
            seededAt,
            readIds: addRead(get().readIds, derived.filter(d => d.read).map(d => d.id)),
            pendingSeen: Array.from(pendingSeen).slice(-100),
          })
        })()
        get().refreshServer()
      },

      reset: () => set({ userId: null, items: [], server: [], dismissed: [], seeded: false, seededAt: null, readIds: [], pendingSeen: [], lastServerFetch: 0 }),

      all: () => {
        const dismissed = new Set(get().dismissed)
        const server = get().server
        // The reviewer's rejection is also pushed by the server (route → KYC);
        // when that copy is present, don't show our derived duplicate too.
        const serverHasKyc = server.some(n => n.route === '/(auth)/kyc')
        return [...server, ...get().items]
          .filter(n => !dismissed.has(n.id))
          .filter(n => !(serverHasKyc && n.id.startsWith('acct:kyc-rejected')))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 60)
      },
      unread: () => get().all().filter(n => !n.read).length,
    }),
    {
      name: 'etico.notifications.v2',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ userId: s.userId, items: s.items, server: s.server, dismissed: s.dismissed, seeded: s.seeded, seededAt: s.seededAt, readIds: s.readIds, pendingSeen: s.pendingSeen }),
      // Saves from before this change had no readIds: carry their read flags
      // over so nothing already read lights up after the update.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<NotifState>
        const readIds = p.readIds ?? [...(p.items ?? []), ...(p.server ?? [])].filter(n => n.read).map(n => n.id)
        const seededAt = p.seededAt ?? (p.seeded ? new Date().toISOString() : null)
        return { ...current, ...p, readIds, seededAt }
      },
    },
  ),
)
