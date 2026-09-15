import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { PacOrderListItem } from '@/lib/pacApi'
import { naira } from '@/lib/format'
import { notifyOrderFilled } from '@/lib/pushNotifications'

export type NotifType = 'trade' | 'account' | 'system'

export interface Notif {
  id: string
  type: NotifType
  title: string
  body: string
  createdAt: string      // ISO
  read: boolean
  route?: string         // where tapping should take the user
}

interface AccountStatus {
  kycStatus?: string | null
  cacsStatus?: string | null
}

interface NotifState {
  items: Notif[]
  markRead: (id: string) => void
  markAllRead: () => void
  clearAll: () => void
  /** Rebuild derived notifications from orders + account status, preserving
   *  read flags for anything we've already shown. Idempotent. */
  sync: (orders: PacOrderListItem[], status: AccountStatus) => void
  unread: () => number
}

function buildDerived(orders: PacOrderListItem[], status: AccountStatus): Notif[] {
  const out: Notif[] = []

  // System welcome (always present, oldest).
  out.push({
    id: 'sys:welcome',
    type: 'system',
    title: 'Welcome to ETICO',
    body: 'Ethical investing on the Nigerian Exchange. Your notifications will show up here.',
    createdAt: '2000-01-01T00:00:00.000Z',
    read: false,
  })

  // Account setup reminders.
  if (status.kycStatus && status.kycStatus !== 'verified') {
    out.push({
      id: 'acct:kyc',
      type: 'account',
      title: 'Verify your identity',
      body: 'Complete your KYC to unlock trading on the NGX.',
      createdAt: new Date().toISOString(),
      read: false,
      route: '/(auth)/kyc',
    })
  } else if (status.cacsStatus && status.cacsStatus !== 'approved') {
    out.push({
      id: 'acct:cacs',
      type: 'account',
      title: 'Finish your NGX setup',
      body: 'Submit your CSCS/CACS details to start placing trades.',
      createdAt: new Date().toISOString(),
      read: false,
      route: '/(app)/account',
    })
  } else if (status.cacsStatus === 'approved') {
    out.push({
      id: 'acct:cscs-ready',
      type: 'account',
      title: 'Your CSCS account is ready',
      body: 'Your CSCS/CACS setup is complete. You can now trade on the NGX.',
      createdAt: new Date().toISOString(),
      read: false,
      route: '/(app)',
    })
  }

  // Order-driven notifications (most recent 20 orders).
  for (const o of orders.slice(0, 20)) {
    const s = (o.orderStatus ?? 'UNKNOWN').toUpperCase()
    const side = o.side === 'BUY' ? 'buy' : 'sell'
    const qty = o.filledQty || o.requestedQty
    const when = o.updatedAt || o.createdAt || new Date().toISOString()
    const base = { type: 'trade' as const, createdAt: when, read: false, route: `/receipt/${o.id}` }

    if (s === 'FILLED') {
      out.push({ ...base, id: `order:${o.id}:filled`,
        title: 'Order filled',
        body: `Your ${side} of ${qty} ${o.secId} is complete — ${naira(o.totalValue)}.` })
    } else if (s.includes('CANCEL')) {
      out.push({ ...base, id: `order:${o.id}:cancelled`,
        title: 'Order cancelled',
        body: `Your ${side} order for ${o.secId} was cancelled.` })
    } else {
      out.push({ ...base, id: `order:${o.id}:pending`,
        title: 'Order received',
        body: `We're working on your ${side} order for ${o.secId}. We'll notify you when it fills.` })
    }
  }

  return out
}

export const useNotificationStore = create<NotifState>()(
  persist(
    (set, get) => ({
      items: [],
      markRead: (id) => set(s => ({ items: s.items.map(n => n.id === id ? { ...n, read: true } : n) })),
      markAllRead: () => set(s => ({ items: s.items.map(n => ({ ...n, read: true })) })),
      clearAll: () => set({ items: [] }),
      sync: (orders, status) => {
        const prev = new Map(get().items.map(n => [n.id, n]))

        // Detect pending → filled transitions and fire a tray notification for
        // each. Guard: only when we previously recorded the order as pending and
        // hadn't already marked it filled, so pre-existing fills on first load
        // (and immediate market fills, already notified at placement) don't fire.
        for (const o of orders.slice(0, 20)) {
          if ((o.orderStatus ?? '').toUpperCase() !== 'FILLED') continue
          const filledId = `order:${o.id}:filled`
          const pendingId = `order:${o.id}:pending`
          if (!prev.has(filledId) && prev.has(pendingId)) {
            notifyOrderFilled({
              side: o.side, symbol: o.secId,
              qty: o.filledQty || o.requestedQty, total: o.totalValue, orderId: o.id,
            })
          }
        }

        const derived = buildDerived(orders, status)
        const byId = new Map(prev)
        for (const d of derived) {
          const existing = prev.get(d.id)
          byId.set(d.id, existing ? { ...d, read: existing.read } : d)
        }
        const merged = Array.from(byId.values())
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 50)
        set({ items: merged })
      },
      unread: () => get().items.filter(n => !n.read).length,
    }),
    {
      name: 'etico.notifications',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
)
