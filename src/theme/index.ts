import { useMemo } from 'react'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Appearance, useColorScheme } from 'react-native'
import { lightPalette, darkPalette, type Palette } from './palettes'

// ─────────────────────────────────────────────────────────────────────
// Theme mode store
// ─────────────────────────────────────────────────────────────────────
// The user's chosen mode. 'system' follows the phone's setting.
export type ThemeMode = 'system' | 'light' | 'dark'

interface ThemeStore {
  mode: ThemeMode
  setMode: (m: ThemeMode) => void
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      mode: 'system',
      setMode: (mode) => {
        set({ mode })
        // Sync the module-level active palette immediately so any
        // non-reactive `colors.*` accesses in the next render tick
        // pick up the new theme.
        activePalette = resolvePalette(mode)
      },
    }),
    {
      name: 'moneta.theme',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (state) activePalette = resolvePalette(state.mode)
      },
    }
  )
)

// ─────────────────────────────────────────────────────────────────────
// Palette resolution
// ─────────────────────────────────────────────────────────────────────
export function resolveScheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return (Appearance.getColorScheme() ?? 'light')
  return mode
}

export function resolvePalette(mode: ThemeMode): Palette {
  return resolveScheme(mode) === 'dark' ? darkPalette : lightPalette
}

// The active palette. A module-level `let` so the Proxy below can read
// from a single source. Root layout keeps this in sync via `setActivePalette`.
let activePalette: Palette = resolvePalette('system')
export function setActivePalette(p: Palette) { activePalette = p }
export function getActivePalette(): Palette { return activePalette }

// ─────────────────────────────────────────────────────────────────────
// Colors proxy
// ─────────────────────────────────────────────────────────────────────
// Every `colors.bg` (etc) access reads from `activePalette` at call time,
// so the rest of the codebase can keep importing `colors` as if it were
// a static object. Combined with a root-level re-render on theme change
// (see app/_layout.tsx), all screens repaint with the new palette.
export const colors: Palette = new Proxy({} as Palette, {
  get: (_target, key) => activePalette[key as keyof Palette],
  // Provide `has` and `ownKeys` so devtools + JSON.stringify behave.
  has: (_target, key) => key in activePalette,
  ownKeys: () => Object.keys(activePalette),
  getOwnPropertyDescriptor: (_target, key) => ({
    enumerable: true,
    configurable: true,
    value: activePalette[key as keyof Palette],
  }),
})

// ─────────────────────────────────────────────────────────────────────
// Non-color tokens (unchanged across themes)
// ─────────────────────────────────────────────────────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 56,
} as const

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const

export const typography = {
  display: { fontSize: 40, fontWeight: '800' as const, letterSpacing: -1.2, lineHeight: 44 },
  h1:      { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.6, lineHeight: 34 },
  h2:      { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.4, lineHeight: 28 },
  h3:      { fontSize: 17, fontWeight: '700' as const, letterSpacing: -0.2, lineHeight: 22 },
  body:    { fontSize: 15, fontWeight: '500' as const, lineHeight: 22 },
  bodyStrong: { fontSize: 15, fontWeight: '700' as const, lineHeight: 22 },
  small:   { fontSize: 13, fontWeight: '500' as const, lineHeight: 18 },
  smallStrong: { fontSize: 13, fontWeight: '700' as const, lineHeight: 18 },
  eyebrow: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const, lineHeight: 14 },
  mono:    { fontFamily: 'monospace' as const, fontSize: 13 },
} as const

export const shadow = {
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 3,
  },
} as const

export const theme = { colors, spacing, radii, typography, shadow } as const
export type Theme = typeof theme
export type { Palette } from './palettes'

// ─────────────────────────────────────────────────────────────
// useThemedStyles — the fix for StyleSheet.create baking colors
// ─────────────────────────────────────────────────────────────
// StyleSheet.create({ backgroundColor: colors.bg }) evaluates the Proxy
// getter ONCE at module load and stores the returned string. When the
// palette flips, the stored value is stale — that's why dark mode was only
// half-applying.
//
// Wrapping the factory in this hook re-runs StyleSheet.create whenever the
// effective scheme changes, so the returned StyleSheet always reflects the
// current palette.
export function useThemedStyles<T>(factory: () => T): T {
  const effective = useEffectiveScheme()
  return useMemo(factory, [effective]) // eslint-disable-line react-hooks/exhaustive-deps
}

// Read the currently-effective color scheme in a component. Reactive to
// both the user's stored mode choice and the OS-level scheme change.
export function useEffectiveScheme(): 'light' | 'dark' {
  const mode      = useThemeStore(s => s.mode)
  const sysScheme = useColorScheme() ?? 'light'
  return mode === 'system' ? sysScheme : mode
}
