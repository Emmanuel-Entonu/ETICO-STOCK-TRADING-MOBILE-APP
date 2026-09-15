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

  // Lock immediately on background so the very first frame of the resume
  // is already the splash — no Home flash. If the user comes back within
  // BACKGROUND_GRACE_MS, handleForeground re-unlocks silently.
  handleBackground: () => {
    const s = get()
    if (s.unlockedThisSession) {
      set({ backgroundedAt: Date.now(), unlockedThisSession: false })
    }
  },
  handleForeground: () => {
    const bg = get().backgroundedAt
    if (!bg || Date.now() - bg > BACKGROUND_GRACE_MS) {
      set({ backgroundedAt: null })
      return
    }
    // Only silently re-unlock if the same authenticated user is still
    // logged in. Otherwise (signOut fired while backgrounded, session
    // expired, or a new user is about to log in) leave locked so the
    // login/PIN screen isn't skipped.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useAuthStore } = require('@/store/authStore') as typeof import('@/store/authStore')
    if (useAuthStore.getState().user) {
      set({ unlockedThisSession: true, backgroundedAt: null })
    } else {
      set({ backgroundedAt: null })
    }
  },
}))
