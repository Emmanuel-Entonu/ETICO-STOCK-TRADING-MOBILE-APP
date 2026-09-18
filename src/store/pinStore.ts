import { create } from 'zustand'

// 60-second grace: if the app is backgrounded for less than this, we do not
// re-prompt for the PIN when it foregrounds. Matches banking-app UX.
const BACKGROUND_GRACE_MS = 60_000

interface PinState {
  unlockedThisSession: boolean
  backgroundedAt: number | null

  unlock:            () => void
  lock:              () => void
  handleBackground:  () => void
  handleForeground:  () => void
}

// In-memory only. Never persisted — force-kill or grace-window expiry both
// return the user to the PIN screen.
export const usePinStore = create<PinState>((set, get) => ({
  unlockedThisSession: false,
  backgroundedAt: null,

  unlock: () => set({ unlockedThisSession: true, backgroundedAt: null }),
  lock:   () => set({ unlockedThisSession: false, backgroundedAt: null }),

  // Just record WHEN we left — do NOT lock here. Locking on background flips
  // `unlockedThisSession` to false, which makes AuthGate immediately
  // `router.replace('/(auth)/pin')` and tear down the whole navigation stack.
  // The result was: a split-second minimize dumped the user back on Home and
  // lost whatever screen (trade sheet, wallet, …) they were on, and left the
  // trade modal with nothing behind it so the back button closed the app.
  // The screen is already blocked while backgrounded by FLAG_SECURE + the
  // native privacy overlay (Android) and the JS PrivacyOverlay, so there's no
  // need to lock the session until we know how long they were actually away.
  handleBackground: () => {
    const s = get()
    if (s.unlockedThisSession && s.backgroundedAt == null) {
      set({ backgroundedAt: Date.now() })
    }
  },
  // Decide on the way back in. Within the grace window we were never locked,
  // so the user lands exactly where they left off. Past the grace window we
  // lock now — AuthGate then routes to the PIN screen for re-entry.
  handleForeground: () => {
    const bg = get().backgroundedAt
    if (bg == null) return

    if (Date.now() - bg > BACKGROUND_GRACE_MS) {
      // Away too long → require the PIN again. (If the user was signed out
      // while away, `unlockedThisSession` is already false — this is a no-op
      // beyond clearing the timestamp, and the login flow isn't skipped.)
      set({ unlockedThisSession: false, backgroundedAt: null })
      return
    }
    // Back within grace → nothing to do; still unlocked, same screen.
    set({ backgroundedAt: null })
  },
}))
