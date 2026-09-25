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
//  • LOCAL  — order fills / cancellations derived from PAC orders.
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
  items: Notif[]            // LOCAL derived items (with read flags)
  server: Notif[]           // SERVER items (read = read_at set)
  dismissed: string[]
  seeded: boolean           // first sync for this user done (history marked read)
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

function derive(orders: PacOrderListItem[], status: AccountStatus): Notif[] {
  const out: Notif[] = []
  out.push({
    id: 'sys:welcome', type: 'system',
    title: 'Welcome to ETICO',
    body: 'Ethical investing on the Nigerian Exchange. Your updates will show up here.',
    createdAt: '2000-01-01T00:00:00.000Z', read: true,
  })
  // One actionable reminder while KYC hasn't been started — not a status feed.
  if (!status.kycStatus || status.kycStatus === 'pending') {
    out.push({
      id: 'acct:kyc', type: 'account',
      title: 'Verify your identity',
      body: 'Complete your KYC to unlock trading on the NGX.',
      createdAt: '2000-01-02T00:00:00.000Z', read: false, route: '/(auth)/kyc',
    })
  }
  for (const o of orders.slice(0, 30)) {
    const s = (o.orderStatus ?? '').toUpperCase()
    const side = o.side === 'BUY' ? 'buy' : 'sell'
    const qty = o.filledQty || o.requestedQty
    const when = o.updatedAt || o.createdAt || new Date().toISOString()
    const base = { type: 'trade' as const, createdAt: when, read: false, route: `/receipt/${o.id}` }
    if (s === 'FILLED') {
      out.push({ ...base, id: `order:${o.id}:filled`, title: `Order filled: ${o.secId}`,
        body: `Your ${side} of ${qty.toLocaleString()} ${o.secId} is complete — ${naira(o.totalValue)}.` })
    } else if (s.includes('CANCEL')) {
      out.push({ ...base, id: `order:${o.id}:cancelled`, title: `Order cancelled: ${o.secId}`,
        body: `Your ${side} order for ${o.secId} was cancelled.` })
    }
  }
  return out
}

const currentUserId = async () => (await supabase.auth.getSession()).data.session?.user?.id ?? null

export const useNotificationStore = create<NotifState>()(
  persist(
    (set, get) => ({
      userId: null,
      items: [],
      server: [],
      dismissed: [],
      seeded: false,
      pendingSeen: [],
      lastServerFetch: 0,

      markRead: (id) => {
        const srv = get().server.find(n => n.id === id)
        set(s => ({
          items: s.items.map(n => n.id === id ? { ...n, read: true } : n),
          server: s.server.map(n => n.id === id ? { ...n, read: true } : n),
        }))
        if (srv?.serverId && !srv.read) {
          supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', srv.serverId).then(() => {})
        }
      },
      markAllRead: () => {
        const hadUnreadServer = get().server.some(n => !n.read)
        set(s => ({ items: s.items.map(n => ({ ...n, read: true })), server: s.server.map(n => ({ ...n, read: true })) }))
        if (hadUnreadServer) {
          supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null).then(() => {})
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
        const uid = await currentUserId()
        if (!uid) return
        if (get().userId && get().userId !== uid) get().reset()
        const { data, error } = await supabase
          .from('notifications')
          .select('id, type, title, body, route, created_at, read_at')
          .order('created_at', { ascending: false })
          .limit(50)
        if (error || !data) return
        set({
          userId: uid,
          server: data.map((r) => ({
            id: `srv:${r.id}`, serverId: r.id as string,
            type: ((r.type as string) ?? 'account') as NotifType,
            title: r.title as string, body: r.body as string,
            route: (r.route as string | null) ?? undefined,
            createdAt: r.created_at as string, read: !!r.read_at,
          })),
        })
      },

      sync: (orders, status) => {
        void (async () => {
          const uid = await currentUserId()
          if (!uid) return
          if (get().userId !== uid) { get().reset(); set({ userId: uid }) }

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

          // First sync for this account: everything that already exists is
          // history, not news → mark read (no flood on a new device/reinstall).
          const firstRun = !get().seeded
          const next = derive(orders, status).map(d => {
            const existing = prev.get(d.id)
            if (existing) return { ...d, read: existing.read }
            return firstRun && d.type === 'trade' ? { ...d, read: true } : d
          })
          set({ items: next, seeded: true, pendingSeen: Array.from(pendingSeen).slice(-100) })
        })()
        get().refreshServer()
      },

      reset: () => set({ userId: null, items: [], server: [], dismissed: [], seeded: false, pendingSeen: [], lastServerFetch: 0 }),

      all: () => {
        const dismissed = new Set(get().dismissed)
        return [...get().server, ...get().items]
          .filter(n => !dismissed.has(n.id))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 60)
      },
      unread: () => get().all().filter(n => !n.read).length,
    }),
    {
      name: 'etico.notifications.v2',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ userId: s.userId, items: s.items, server: s.server, dismissed: s.dismissed, seeded: s.seeded, pendingSeen: s.pendingSeen }),
    },
  ),
)
