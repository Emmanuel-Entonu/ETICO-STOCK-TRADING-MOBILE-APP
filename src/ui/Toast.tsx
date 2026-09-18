// Global toast system. Replaces the platform Alert.alert white boxes with
// a branded slide-down banner that auto-dismisses.
//
// Usage:
//   import { toast } from '@/ui'
//   toast.show({ title: 'Trade canceled', message: 'PIN not entered', tone: 'warning' })
//
// The <ToastHost /> component (mounted once at the root layout) subscribes
// to the internal store and renders whatever is queued. Only one toast is
// visible at a time; new calls replace whatever was showing.

import { useEffect } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MotiView, AnimatePresence } from 'moti'
import { create } from 'zustand'
import * as Haptics from 'expo-haptics'
import { Text } from './Text'
import { Icon } from './Icon'
import { colors, spacing, radii, useThemedStyles } from '@/theme'

export type ToastTone = 'success' | 'warning' | 'negative' | 'info'

export interface ToastPayload {
  id?:      number
  title:    string
  message?: string
  tone?:    ToastTone
  duration?: number   // ms; default 3200
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
    // Haptic feedback matches the tone.
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

// ─────────────────────────────────────────────────────────────
// Host — mount once at root. Reads the store and renders whatever is queued.
// ─────────────────────────────────────────────────────────────
export function ToastHost() {
  const current = useToastStore(s => s.current)
  const dismiss = useToastStore(s => s.dismiss)
  const styles  = useThemedStyles(makeStyles)

  useEffect(() => {
    if (!current) return
    const t = setTimeout(dismiss, current.duration ?? 3200)
    return () => clearTimeout(t)
  }, [current, dismiss])

  return (
    <SafeAreaView pointerEvents="box-none" style={styles.host} edges={['top']}>
      <AnimatePresence>
        {current && (
          <MotiView
            key={current.id}
            from={{ opacity: 0, translateY: -30 }}
            animate={{ opacity: 1, translateY: 0 }}
            exit={{ opacity: 0, translateY: -20 }}
            transition={{ type: 'spring', damping: 18, stiffness: 220, mass: 0.7 }}
            style={styles.wrap}
          >
            <Pressable onPress={dismiss} style={[styles.card, toneStyle(current.tone)]}>
              <View style={[styles.iconBubble, iconBubbleStyle(current.tone)]}>
                <Icon name={iconFor(current.tone)} size={18} color={iconColorFor(current.tone)} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="bodyStrong" numberOfLines={1} style={{ color: colors.text }}>{current.title}</Text>
                {current.message && (
                  <Text variant="small" numberOfLines={2} style={{ color: colors.textMuted, marginTop: 2 }}>
                    {current.message}
                  </Text>
                )}
              </View>
            </Pressable>
          </MotiView>
        )}
      </AnimatePresence>
    </SafeAreaView>
  )
}

function iconFor(tone?: ToastTone): string {
  switch (tone) {
    case 'success':  return 'solar:check-read-bold'
    case 'negative': return 'solar:close-square-bold'
    case 'warning':  return 'solar:danger-triangle-bold'
    default:         return 'solar:info-circle-bold'
  }
}

function iconColorFor(tone?: ToastTone): string {
  switch (tone) {
    case 'success':  return colors.positive
    case 'negative': return colors.negative
    case 'warning':  return colors.warning
    default:         return colors.brand
  }
}

function iconBubbleStyle(tone?: ToastTone) {
  switch (tone) {
    case 'success':  return { backgroundColor: colors.positiveSubtle }
    case 'negative': return { backgroundColor: colors.negativeSubtle }
    case 'warning':  return { backgroundColor: colors.warningSubtle }
    default:         return { backgroundColor: colors.brandSubtle }
  }
}

function toneStyle(tone?: ToastTone) {
  switch (tone) {
    case 'success':  return { borderLeftColor: colors.positive }
    case 'negative': return { borderLeftColor: colors.negative }
    case 'warning':  return { borderLeftColor: colors.warning }
    default:         return { borderLeftColor: colors.brand }
  }
}

const makeStyles = () => StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  wrap: {
    width: '92%',
    marginTop: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    paddingLeft: spacing.md - 4, // room for border-left highlight
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 12,
  },
  iconBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
