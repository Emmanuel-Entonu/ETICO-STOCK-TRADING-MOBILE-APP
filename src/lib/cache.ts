// Tiny SWR-style persistent cache backed by AsyncStorage. Used to instantly
// paint stale portfolio/market data on cold-start so the app never shows an
// empty white screen while the first PAC/MDS response is in flight.
//
// Values are namespaced under `moneta.cache.*` and stamped with a saved-at
// timestamp so callers can decide whether to trust the cached copy or wait
// for the fresh fetch. Cache misses / parse errors return null (never throw).

import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY_PREFIX = 'moneta.cache.'

interface CacheEnvelope<T> {
  v: 1
  savedAt: number   // ms since epoch
  data: T
}

export async function cacheGet<T>(key: string, maxAgeMs?: number): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + key)
    if (!raw) return null
    const env = JSON.parse(raw) as CacheEnvelope<T>
    if (env.v !== 1 || !env.data) return null
    if (maxAgeMs != null && Date.now() - env.savedAt > maxAgeMs) return null
    return env.data
  } catch { return null }
}

export async function cacheSet<T>(key: string, data: T): Promise<void> {
  try {
    const env: CacheEnvelope<T> = { v: 1, savedAt: Date.now(), data }
    await AsyncStorage.setItem(KEY_PREFIX + key, JSON.stringify(env))
  } catch { /* best-effort; storage full or unavailable */ }
}

export async function cacheClear(prefix?: string): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys()
    const target = keys.filter(k => k.startsWith(KEY_PREFIX + (prefix ?? '')))
    if (target.length > 0) await AsyncStorage.multiRemove(target)
  } catch { /* best-effort */ }
}

// Common TTLs.
export const TTL = {
  market:    2 * 60 * 1000,    // 2 min — quotes go stale fast during trading
  positions: 5 * 60 * 1000,    // 5 min — positions change on fills only
  account:   5 * 60 * 1000,    // 5 min — cash balance
  orders:    2 * 60 * 1000,    // 2 min — order status
} as const
