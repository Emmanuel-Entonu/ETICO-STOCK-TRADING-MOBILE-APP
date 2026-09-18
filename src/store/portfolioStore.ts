import { create } from 'zustand'
import {
  getClientPositions, getMarketData, getAccountById, placeOrder as pacPlaceOrder,
  cancelOrder as pacCancelOrder, listOrders, listFills,
  type PacPosition, type PacMarketData, type PacAccount,
  type PacOrderRequest, type PacOrderListItem, type PacOrderFill,
} from '@/lib/pacApi'
import { supabase } from '@/lib/supabase'
import { cacheGet, cacheSet, cacheClear, TTL } from '@/lib/cache'
import { useAuthStore } from './authStore'

// SWR pattern: paint whatever we have cached (if not too stale), then
// fetch fresh in the background. Cuts perceived load time on every screen
// that reads market/positions/account/orders from "empty until network
// resolves" to "instant with a soft refresh."

interface PortfolioState {
  apiStatus: string | null
  account: PacAccount | null
  positions: PacPosition[]
  marketData: PacMarketData[]
  loadingPortfolio: boolean
  loadingMarket: boolean
  orderLoading: boolean
  orderResult: { success: boolean; message: string; orderId?: string | null } | null

  pacOrders: PacOrderListItem[]
  loadingOrders: boolean
  orderFills: Record<string, PacOrderFill[]>
  loadingFillsId: string | null

  loadAccount: (accountId: string) => Promise<void>
  loadPositions: (accountId: string) => Promise<void>
  loadMarketData: () => Promise<void>
  loadOrders: (accountId: string) => Promise<void>
  loadFills: (orderId: string) => Promise<void>
  placeOrder: (order: PacOrderRequest, idempotencyKey?: string) => Promise<void>
  cancelOrder: (pacOrderId: string, supabaseOrderId: string | null) => Promise<void>
  clearOrderResult: () => void
  reset: () => void
}

// Single-flight guard for the market fetch. BrandSplash (cold-start) and the
// Market/Invest screens can all call loadMarketData near-simultaneously; without
// this each call fires ~60 per-symbol quote requests, so the proxy got hit with
// 2–3 concurrent storms on launch. Share the in-flight promise instead.
let _marketInFlight: Promise<void> | null = null

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
  account: null,
  positions: [],
  marketData: [],
  pacOrders: [],
  orderFills: {},
  loadingPortfolio: false,
  loadingMarket: false,
  loadingOrders: false,
  loadingFillsId: null,
  orderLoading: false,
  orderResult: null,
  apiStatus: null,

  loadAccount: async (accountId) => {
    // Cache-first: paint any cached balance for this account, then refresh.
    if (!get().account) {
      const cached = await cacheGet<PacAccount>(`account.${accountId}`, TTL.account)
      if (cached && !get().account) set({ account: cached })
    }
    try {
      const fresh = await getAccountById(accountId)
      set({ account: fresh })
      cacheSet(`account.${accountId}`, fresh)
    } catch (e) { console.error('loadAccount error:', e) }
  },

  loadPositions: async (accountId) => {
    // Paint stale positions + account immediately so Holdings tab isn't
    // empty during the network round-trip.
    if (get().positions.length === 0) {
      const cached = await cacheGet<PacPosition[]>(`positions.${accountId}`, TTL.positions)
      if (cached && get().positions.length === 0) set({ positions: cached })
    }
    if (!get().account) {
      const cachedAcct = await cacheGet<PacAccount>(`account.${accountId}`, TTL.account)
      if (cachedAcct && !get().account) set({ account: cachedAcct })
    }
    set({ loadingPortfolio: true, apiStatus: null })
    const [positions, account] = await Promise.allSettled([
      getClientPositions(accountId),
      getAccountById(accountId),
    ])
    if (positions.status === 'fulfilled') {
      set({ positions: positions.value })
      cacheSet(`positions.${accountId}`, positions.value)
    } else {
      const msg = (positions.reason as Error)?.message ?? String(positions.reason)
      if (!msg.includes('404') && !msg.toLowerCase().includes('not found')) {
        set({ apiStatus: `ERROR: ${msg}` })
        // Keep whatever we painted from cache; don't wipe to [] on transient errors.
      } else set({ positions: [] })
    }
    if (account.status === 'fulfilled') {
      set({ account: account.value })
      cacheSet(`account.${accountId}`, account.value)
    }
    set({ loadingPortfolio: false })
  },

  loadOrders: async (accountId) => {
    if (get().pacOrders.length === 0) {
      const cached = await cacheGet<PacOrderListItem[]>(`orders.${accountId}`, TTL.orders)
      if (cached && get().pacOrders.length === 0) set({ pacOrders: cached })
    }
    set({ loadingOrders: true })
    try {
      const fresh = await listOrders(accountId)
      set({ pacOrders: fresh, apiStatus: null })
      cacheSet(`orders.${accountId}`, fresh)
    } catch (e) {
      const msg = (e as Error).message ?? String(e)
      console.error('[loadOrders] failed:', msg)
      set({ apiStatus: `Orders load failed: ${msg}` })
    } finally { set({ loadingOrders: false }) }
  },

  loadFills: async (orderId) => {
    set({ loadingFillsId: orderId })
    try {
      const fills = await listFills(orderId)
      set(state => ({ orderFills: { ...state.orderFills, [orderId]: fills } }))
    } catch {
      set(state => ({ orderFills: { ...state.orderFills, [orderId]: [] } }))
    } finally { set({ loadingFillsId: null }) }
  },

  loadMarketData: async () => {
    // Dedup concurrent callers (see _marketInFlight above) — return the shared
    // promise instead of firing a second quote storm.
    if (_marketInFlight) return _marketInFlight
    // Cache-first paint: previous quotes appear instantly on Market/Home,
    // then the live fetch replaces them. Prevents the "no stocks yet" flash.
    if (get().marketData.length === 0) {
      const cached = await cacheGet<PacMarketData[]>('market', TTL.market)
      if (cached && get().marketData.length === 0) set({ marketData: cached })
    }
    set({ loadingMarket: true, apiStatus: null })
    _marketInFlight = (async () => {
      try {
        const fresh = await getMarketData()
        set({ marketData: fresh })
        cacheSet('market', fresh)
      } catch (e) {
        const msg = (e as Error).message ?? String(e)
        // If we already painted a cached copy, keep it visible instead of wiping.
        if (get().marketData.length === 0) set({ marketData: [] })
        set({ apiStatus: `Market data error: ${msg}` })
      } finally {
        set({ loadingMarket: false })
        _marketInFlight = null
      }
    })()
    return _marketInFlight
  },

  placeOrder: async (order, idempotencyKey) => {
    set({ orderLoading: true, orderResult: null })
    try {
      const result = await pacPlaceOrder(order, idempotencyKey)
      const routingOk = result.routingStatus === 'ACCEPTED' || result.routingStatus === 'DELIVERED'
      const statusOk = result.orderStatus === 'PENDING' || result.orderStatus === 'NEW' ||
        result.orderStatus === 'FILLED' || result.orderStatus === 'PARTIALLY_FILLED' ||
        result.status === 'SUCCESS' || result.status === 'PENDING' || result.orderStatus === 'APPROVED'
      // Presence of an id alone is NOT proof of success — PAC returns an id
      // for validation-only responses too. Require an explicit routing OR
      // status signal before we claim success.
      const success = routingOk || statusOk
      set({
        orderResult: {
          success,
          message: result.routingMessage ?? result.message ?? (success ? 'Order placed' : 'Order failed'),
          orderId: result.id ?? result.orderId ?? null,
        },
      })
      if (success) {
        // Post-order refresh trio (account balance / positions / orders).
        // Deferred by 400ms so the trade modal's dismiss animation and the
        // receipt render land smoothly before three PAC HTTP fetches kick
        // off — previously they fired concurrently with the transition and
        // caused visible stutter on the underlying Home screen.
        const acct = order.accountId
        setTimeout(() => {
          get().loadAccount(acct).catch(() => {})
          get().loadPositions(acct).catch(() => {})
          get().loadOrders(acct).catch(() => {})
        }, 400)
      }
      try {
        const userId = useAuthStore.getState().user?.id
        if (userId) {
          await supabase.from('orders').insert({
            user_id: userId, symbol: order.symbol, side: order.side,
            order_type: order.orderType, quantity: order.quantity,
            limit_price: order.limitPrice ?? null,
            estimated_total: order.estimatedTotal ?? null,
            pac_order_id: result.id ?? result.orderId ?? null,
            status: success ? 'placed' : 'failed',
          })
        }
      } catch (logErr) { console.error('[placeOrder] Supabase logging failed:', logErr) }
    } catch (e: unknown) {
      set({ orderResult: { success: false, message: (e as Error).message } })
    } finally { set({ orderLoading: false }) }
  },

  cancelOrder: async (pacOrderId, supabaseOrderId) => {
    await pacCancelOrder(pacOrderId)
    set(state => ({
      pacOrders: state.pacOrders.map(o =>
        o.id === pacOrderId ? { ...o, orderStatus: 'PENDING_CANCEL' } : o
      ),
    }))
    if (supabaseOrderId) {
      try { await supabase.from('orders').update({ status: 'cancelled' }).eq('id', supabaseOrderId) }
      catch (e) { console.error('[cancelOrder] Supabase update failed:', e) }
    }
  },

  clearOrderResult: () => set({ orderResult: null }),

  // Full wipe — called from authStore.signOut so the next user never sees
  // the previous user's positions / orders / cash while their own load is
  // in flight. Also wipes the on-disk cache under `moneta.cache.*` to
  // prevent SWR-painting user A's positions on user B's cold-start.
  reset: () => {
    cacheClear() // fire-and-forget; positions/account/orders are all keyed by accountId anyway
    set({
      account: null,
      positions: [],
      marketData: [],
      pacOrders: [],
      orderFills: {},
      loadingPortfolio: false,
      loadingMarket: false,
      loadingOrders: false,
      loadingFillsId: null,
      orderLoading: false,
      orderResult: null,
      apiStatus: null,
    })
  },
}))
