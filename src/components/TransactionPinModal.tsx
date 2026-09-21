import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Pressable, StyleSheet, Modal } from 'react-native'
import { BlurView } from 'expo-blur'
import * as Haptics from 'expo-haptics'
import { MotiView } from 'moti'
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, Easing } from 'react-native-reanimated'
import { verifyPin, type VerifyPinResult } from '@/lib/pinApi'
import { Text, Row, Icon } from '@/ui'
import { colors, radii, spacing, useThemedStyles } from '@/theme'

// Shared transaction-PIN gate. Verifies the same PIN used for unlock via the
// server-side verify_pin RPC (bcrypt + rate limit + escalating lockout). Used to
// authorize trades AND wallet funding, so the lockout UX lives in one place.
//
// Lockout UX (matches the server: 3 tries per window, lock on every 3rd wrong,
// escalating): a wrong-but-not-locked attempt shows "Wrong PIN. N tries left";
// a lock shows a live countdown; when the countdown reaches 0 the message and
// the red state CLEAR automatically so the pad looks fresh again.
const PIN_LEN = 6

export function TransactionPinModal({
  visible, submitting, onVerified, onCancel,
  title = 'Transaction PIN',
  subtitle = 'Enter your 6-digit PIN to authorize',
  cancelLabel = 'Cancel',
}: {
  visible: boolean
  submitting: boolean
  onVerified: () => void
  onCancel: () => void
  title?: string
  subtitle?: string
  cancelLabel?: string
}) {
  const styles = useThemedStyles(makeStyles)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const shakeX = useSharedValue(0)
  const verifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }))
  const isLocked = !!lockedUntil && lockedUntil.getTime() > now
  const remainingMs = isLocked ? lockedUntil!.getTime() - now : 0

  useEffect(() => {
    if (!visible) {
      if (verifyTimerRef.current) { clearTimeout(verifyTimerRef.current); verifyTimerRef.current = null }
      setPin(''); setError(null); setLockedUntil(null)
    }
  }, [visible])

  useEffect(() => () => {
    if (verifyTimerRef.current) { clearTimeout(verifyTimerRef.current); verifyTimerRef.current = null }
  }, [])

  // Tick every second while a lockout is active.
  useEffect(() => {
    if (!lockedUntil) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [lockedUntil])

  // When the lockout timer runs out, clear the lock + error so the "wait it out"
  // message and the red state disappear instead of lingering.
  useEffect(() => {
    if (lockedUntil && lockedUntil.getTime() <= now) {
      setLockedUntil(null)
      setError(null)
    }
  }, [now, lockedUntil])

  const runVerify = useCallback(async (value: string) => {
    setBusy(true)
    try {
      const r: VerifyPinResult = await verifyPin(value)
      if (r.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
        setError(null)
        onVerified()
      } else if (r.reason === 'no_pin') {
        setError('Set up your PIN first.')
        onCancel()
      } else if (r.reason === 'locked') {
        // Already locked from a prior attempt — show the countdown, no text.
        setError(null)
        setLockedUntil(r.lockedUntil)
        setPin('')
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
      } else {
        // Wrong PIN.
        setPin('')
        if (r.lockedUntil) {
          // This attempt tripped a lockout → show the countdown.
          setError(null)
          setLockedUntil(r.lockedUntil)
        } else {
          // Still within the window — tell them how many tries remain.
          const left = 3 - (r.attempts % 3)
          setError(left > 0 ? `Wrong PIN. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Wrong PIN.')
          shakeX.value = withSequence(
            withTiming(-10, { duration: 60, easing: Easing.linear }),
            withTiming(10, { duration: 60, easing: Easing.linear }),
            withTiming(-6, { duration: 60, easing: Easing.linear }),
            withTiming(6, { duration: 60, easing: Easing.linear }),
            withTiming(0, { duration: 60, easing: Easing.linear }),
          )
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
      }
    } catch (e) {
      setError((e as Error).message)
      setPin('')
    } finally {
      setBusy(false)
    }
  }, [onVerified, onCancel, shakeX])

  const press = useCallback((d: string) => {
    if (busy || isLocked || submitting) return
    if (pin.length >= PIN_LEN) return
    Haptics.selectionAsync().catch(() => {})
    const next = pin + d
    setPin(next)
    if (next.length === PIN_LEN) {
      if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current)
      verifyTimerRef.current = setTimeout(() => {
        verifyTimerRef.current = null
        runVerify(next)
      }, 120)
    }
  }, [busy, isLocked, submitting, pin, runVerify])

  const backspace = useCallback(() => {
    if (busy || isLocked || submitting) return
    if (pin.length === 0) return
    Haptics.selectionAsync().catch(() => {})
    setPin(pin.slice(0, -1))
  }, [busy, isLocked, submitting, pin])

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.sheetOverlay}>
        <Pressable style={{ flex: 1 }} onPress={onCancel} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          <MotiView
            from={{ opacity: 0, translateY: -8 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 300 }}
            style={{ alignItems: 'center', marginBottom: spacing.lg }}
          >
            <View style={styles.headerIcon}>
              <Icon name="solar:lock-keyhole-bold" size={22} color={colors.brand} />
            </View>
            <Text variant="h3" style={{ marginTop: spacing.md }}>{title}</Text>
            <Text variant="small" tone="muted" style={{ marginTop: 4, textAlign: 'center' }}>{subtitle}</Text>
          </MotiView>

          <Animated.View style={[{ flexDirection: 'row', justifyContent: 'center', gap: spacing.md, marginBottom: spacing.md }, shakeStyle]}>
            {Array.from({ length: PIN_LEN }).map((_, i) => (
              <View
                key={i}
                style={{
                  width: 14, height: 14, borderRadius: 7, borderWidth: 2,
                  borderColor: error && !isLocked ? colors.negative : colors.text,
                  backgroundColor: i < pin.length
                    ? (error && !isLocked ? colors.negative : colors.text)
                    : 'transparent',
                }}
              />
            ))}
          </Animated.View>

          <View style={{ minHeight: 20, alignItems: 'center', marginBottom: spacing.sm }}>
            {isLocked ? (
              <Row gap="xs" align="center">
                <Icon name="solar:lock-keyhole-bold" size={13} color={colors.negative} />
                <Text variant="small" tone="negative">Locked · try again in {formatCountdown(remainingMs)}</Text>
              </Row>
            ) : error ? (
              <Row gap="xs" align="center">
                <Icon name="solar:danger-triangle-bold" size={13} color={colors.negative} />
                <Text variant="small" tone="negative">{error}</Text>
              </Row>
            ) : (
              <Text variant="small" tone="subtle"> </Text>
            )}
          </View>

          <PinKeypad onDigit={press} onBackspace={backspace} disabled={busy || isLocked || submitting} />

          <Pressable onPress={onCancel} style={{ paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm }} hitSlop={8}>
            <Text variant="smallStrong" tone="muted">{cancelLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

function PinKeypad({ onDigit, onBackspace, disabled }: {
  onDigit: (d: string) => void
  onBackspace: () => void
  disabled: boolean
}) {
  const styles = useThemedStyles(makeKeyStyles)
  const rows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'back'],
  ]
  return (
    <View>
      {rows.map((row, i) => (
        <View key={i} style={styles.row}>
          {row.map((k, j) => {
            if (k === '') return <View key={j} style={styles.slot} />
            if (k === 'back') {
              return (
                <Pressable key={j} disabled={disabled} onPress={onBackspace} style={styles.slot}>
                  <View style={[styles.key, disabled && { opacity: 0.4 }]}>
                    <Icon name="solar:close-square-linear" size={20} color={colors.text} />
                  </View>
                </Pressable>
              )
            }
            return (
              <Pressable key={j} disabled={disabled} onPress={() => onDigit(k)} style={styles.slot}>
                <View style={[styles.key, disabled && { opacity: 0.4 }]}>
                  <Text style={styles.keyLabel}>{k}</Text>
                </View>
              </Pressable>
            )
          })}
        </View>
      ))}
    </View>
  )
}

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const PIN_KEY = 60
const makeKeyStyles = () => StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, marginBottom: spacing.sm },
  slot: { width: PIN_KEY, height: PIN_KEY, alignItems: 'center', justifyContent: 'center' },
  key: {
    width: PIN_KEY, height: PIN_KEY, borderRadius: PIN_KEY / 2,
    backgroundColor: colors.bgSubtle, alignItems: 'center', justifyContent: 'center',
  },
  keyLabel: { fontSize: 22, fontWeight: '600', color: colors.text, lineHeight: 26 },
})

const makeStyles = () => StyleSheet.create({
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.xl,
    paddingBottom: spacing['5xl'],
    maxHeight: '90%',
    borderTopWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 20,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: spacing.lg,
  },
  headerIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.brandSubtle,
    alignItems: 'center', justifyContent: 'center',
  },
})
