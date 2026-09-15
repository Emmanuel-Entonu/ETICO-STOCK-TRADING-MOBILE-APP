import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

// Account-synced watchlist. Source of truth is the shared Supabase
// `user_watchlists` table (user_id, symbol) — the SAME rows the web app reads,
// so a star set on the web shows here and vice-versa. RLS scopes every row to
// its owner. We keep an optimistic local copy for instant UI.

interface WatchlistState {
  symbols: string[]
  loading: boolean
  load: () => Promise<void>
  has: (symbol: string) => boolean
  toggle: (symbol: string) => Promise<void>
  reset: () => void
}

export const useWatchlistStore = create<WatchlistState>((set, get) => ({
  symbols: [],
  loading: false,

  load: async () => {
    const userId = useAuthStore.getState().user?.id
    if (!userId) { set({ symbols: [] }); return }
    set({ loading: true })
    try {
      const { data, error } = await supabase
        .from('user_watchlists')
        .select('symbol')
        .eq('user_id', userId)
      if (!error && data) set({ symbols: data.map(r => String(r.symbol).toUpperCase()) })
    } finally {
      set({ loading: false })
    }
  },

  has: (symbol) => get().symbols.includes(symbol.toUpperCase()),

  toggle: async (symbol) => {
    const sym = symbol.toUpperCase()
    const userId = useAuthStore.getState().user?.id
    if (!userId) throw new Error('Sign in to use your watchlist')
    const prev = get().symbols
    const had = prev.includes(sym)
    // Optimistic update.
    set({ symbols: had ? prev.filter(s => s !== sym) : [...prev, sym] })
    try {
      if (had) {
        const { error } = await supabase.from('user_watchlists')
          .delete().eq('user_id', userId).eq('symbol', sym)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from('user_watchlists')
          .upsert({ user_id: userId, symbol: sym }, { onConflict: 'user_id,symbol' })
        if (error) throw new Error(error.message)
      }
    } catch (e) {
      set({ symbols: prev })   // rollback
      throw e
    }
  },

  reset: () => set({ symbols: [], loading: false }),
}))
