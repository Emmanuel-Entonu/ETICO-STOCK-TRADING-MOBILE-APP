// Global toast system. Replaces the platform Alert.alert white boxes with a
// branded, auto-dismissing message.
//
// Usage:
//   import { toast } from '@/ui'
//   toast.show({ title: 'Trade canceled', message: 'PIN not entered', tone: 'warning' })
//
// <ToastHost /> is mounted once at the root layout. One toast at a time; a new
// call replaces the current one.
//
// Design (2026-09-28 redesign, following common toast/snackbar guidance):
//  • Bottom-centre, in the thumb zone — clear of the notch, the status bar and
//    the phone's own notifications (the old top banner collided with all three).
//    Rides above the keyboard when it's open.
//  • High-contrast "snackbar" card (dark in light mode, raised in dark mode) so it
//    reads on any screen, with a tone-coloured icon. No coloured side bar.
//  • Time on screen scales with length (≈1s per 3 words + 2s, 3–7s; errors get
//    longer) instead of a fixed 3.2s that cut long messages off.
//  • Tap or swipe down to dismiss; announced to screen readers.

import { useEffect, useState } from 'react'
import { View, Pressable, StyleSheet, Keyboard, Platform, AccessibilityInfo, PanResponder } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MotiView, AnimatePresence } from 'moti'
import { create } from 'zustand'
import * as Haptics from 'expo-haptics'
import { Text } from './Text'
import { Icon } from './Icon'
import { spacing, useEffectiveScheme } from '@/theme'

export type ToastTone = 'success' | 'warning' | 'negative' | 'info'

export interface ToastPayload {
  id?:      number
  title:    string
  message?: string
  tone?:    ToastTone
  duration?: number   // ms; default scales with the text length
}

interface ToastState {
  current: (ToastPayload & { id: number }) | null
  show:    (t: ToastPayload) => void
  dismiss: () => void
}

let _counter = 1

const useToastStore = create<ToastState>((set) => ({
  current: null,
  show: (t) => set({ current: { ...t, id: _counter++ } }),
  dismiss: () => set({ current: null }),
}))

// Imperative API — importable anywhere without needing a hook or context.
export const toast = {
  show:    (t: ToastPayload) => {
    useToastStore.getState().show(t)
    AccessibilityInfo.announceForAccessibility([t.title, t.message].filter(Boolean).join('. '))
    switch (t.tone) {
      case 'success':  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); break
      case 'negative': Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}); break
      case 'warning':  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}); break
      default: Haptics.selectionAsync().catch(() => {})
    }
  },
  dismiss: () => useToastStore.getState().dismiss(),
  success: (title: string, message?: string) => toast.show({ title, message, tone: 'success' }),
  error:   (title: string, message?: string) => toast.show({ title, message, tone: 'negative' }),
  warn:    (title: string, message?: string) => toast.show({ title, message, tone: 'warning' }),
  info:    (title: string, message?: string) => toast.show({ title, message, tone: 'info' }),
}

function durationFor(t: ToastPayload): number {
  if (t.duration) return t.duration
  const words = `${t.title} ${t.message ?? ''}`.trim().split(/\s+/).length
  const ms = 2000 + (words / 3) * 1000 + (t.tone === 'negative' ? 1500 : 0)
  return Math.min(7000, Math.max(3000, ms))
}

// Tone colours tuned for the dark snackbar surface (both themes).
const TONE = {
  success:  { icon: 'solar:check-circle-bold',   color: '#5FD38A' },
  negative: { icon: 'solar:close-circle-bold',   color: '#FF7A70' },
  warning:  { icon: 'solar:danger-triangle-bold', color: '#F2C94C' },
  info:     { icon: 'solar:info-circle-bold',    color: '#E8D9A8' },
} as const

// Bottom offset that clears the floating tab bar / sticky bottom buttons.
const BOTTOM_CLEARANCE = 92

export function ToastHost() {
  const current = useToastStore(s => s.current)
  const dismiss = useToastStore(s => s.dismiss)
  const insets = useSafeAreaInsets()
  const dark = useEffectiveScheme() === 'dark'

  // Sit above the keyboard when it's open.
  const [kb, setKb] = useState(0)
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKb(e.endCoordinates.height))
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(0))
    return () => { show.remove(); hide.remove() }
  }, [])

  useEffect(() => {
    if (!current) return
    const t = setTimeout(dismiss, durationFor(current))
    return () => clearTimeout(t)
  }, [current, dismiss])

  // Swipe down to dismiss.
  const [pan] = useState(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderRelease: (_e, g) => { if (g.dy > 24) useToastStore.getState().dismiss() },
  }))

  const bottom = kb > 0 ? kb + spacing.md : insets.bottom + BOTTOM_CLEARANCE
  const tone = TONE[current?.tone ?? 'info']

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.host]}>
      <AnimatePresence>
        {current && (
          <MotiView
            key={current.id}
            from={{ opacity: 0, translateY: 24, scale: 0.98 }}
            animate={{ opacity: 1, translateY: 0, scale: 1 }}
            exit={{ opacity: 0, translateY: 16 }}
            transition={{ type: 'spring', damping: 20, stiffness: 240, mass: 0.7 }}
            style={[styles.wrap, { bottom }]}
            {...pan.panHandlers}
          >
            <Pressable
              onPress={dismiss}
              accessibilityRole="alert"
              accessibilityHint="Tap to dismiss"
              style={[styles.card, dark ? styles.cardDark : styles.cardLight]}
            >
              <Icon name={tone.icon} size={22} color={tone.color} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="bodyStrong" numberOfLines={2} style={styles.title}>{current.title}</Text>
                {current.message ? (
                  <Text variant="small" numberOfLines={3} style={styles.message}>{current.message}</Text>
                ) : null}
              </View>
            </Pressable>
          </MotiView>
        )}
      </AnimatePresence>
    </View>
  )
}

// Fixed colours (not the theme proxy): the snackbar is dark in both themes.
const styles = StyleSheet.create({
  host: { zIndex: 9999, elevation: 9999 },
  wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 14,
  },
  cardLight: { backgroundColor: '#1F261B' },
  cardDark:  { backgroundColor: '#232A21', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  title:   { color: '#F5F3EC' },
  message: { color: 'rgba(245,243,236,0.72)', marginTop: 2 },
})
