import 'react-native-url-polyfill/auto'
import { AppState } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { config } from './config'

// Supabase's session (access + refresh tokens) is a bearer credential. If it
// leaks — via a device backup, a rooted device, or a malicious app with the
// same UID (rare on modern Android but possible) — the attacker impersonates
// the user. We store it in the OS keychain (SecureStore) rather than
// AsyncStorage's plaintext file.
//
// SecureStore has a 2 KiB value limit; Supabase sessions are ~1 KiB but can
// grow. If a write ever exceeds that, we fall back to AsyncStorage for that
// key to avoid silent breakage of auth persistence.
const SECURE_STORE_MAX = 2048

const secureAdapter = {
  async getItem(key: string): Promise<string | null> {
    try {
      const v = await SecureStore.getItemAsync(key)
      if (v !== null) return v
    } catch (e) {
      console.warn('[supabase-storage] SecureStore.get failed:', (e as Error).message)
    }
    // Legacy fallback: read from AsyncStorage in case an older build wrote there.
    return AsyncStorage.getItem(key)
  },
  async setItem(key: string, value: string): Promise<void> {
    if (value.length <= SECURE_STORE_MAX) {
      try {
        await SecureStore.setItemAsync(key, value)
        // Best-effort: clean up any legacy AsyncStorage copy of this key.
        AsyncStorage.removeItem(key).catch(() => {})
        return
      } catch (e) {
        console.warn('[supabase-storage] SecureStore.set failed, falling back:', (e as Error).message)
      }
    }
    await AsyncStorage.setItem(key, value)
  },
  async removeItem(key: string): Promise<void> {
    await Promise.allSettled([
      SecureStore.deleteItemAsync(key).catch(() => {}),
      AsyncStorage.removeItem(key).catch(() => {}),
    ])
  },
}

export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: {
    storage: secureAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

// Keep the login alive across long breaks away from the app (Supabase's React
// Native guidance). Without this the token-refresh timer kept firing while the
// app sat in the background with the network half-asleep: the server could
// rotate the refresh token but the reply never arrived, so the app kept the
// old (now used) one, the next refresh was rejected as "already used" and the
// session ended — users had to sign in again after being away a while.
// Refresh only while the app is in the foreground; on return it refreshes once,
// cleanly, with the token it actually holds.
if (AppState.currentState === 'active') supabase.auth.startAutoRefresh()
else supabase.auth.stopAutoRefresh()
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh()
  else supabase.auth.stopAutoRefresh()
})
