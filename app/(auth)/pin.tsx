import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, StyleSheet, Pressable, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { MotiView } from 'moti'
import { BlurView } from 'expo-blur'
import { useAuthStore } from '@/store/authStore'
import { usePinStore } from '@/store/pinStore'
import { setPin, verifyPin, resetPinWithPassword, type VerifyPinResult } from '@/lib/pinApi'
import { Text, Button, Icon } from '@/ui'
import { colors, spacing, radii, useThemedStyles } from '@/theme'
import { useShallow } from 'zustand/react/shallow'

const PIN_LEN = 6

type Mode = 'create' | 'enter'
type CreateStage = 'first' | 'confirm'

export default function PinScreen() {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const params = useLocalSearchParams<{ mode?: Mode }>()
  const mode: Mode = params.mode === 'create' ? 'create' : 'enter'

  const { user, signOut, loadProfile } = useAuthStore(useShallow((s) => ({ user: s.user, signOut: s.signOut, loadProfile: s.loadProfile })))
  const unlock = usePinStore(s => s.unlock)

  const [pin, setPinValue]             = useState('')
  const [stage, setStage]              = useState<CreateStage>('first')
  const [firstPin, setFirstPin]        = useState('')
  const [error, setError]              = useState<string | null>(null)
  const [lockedUntil, setLockedUntil]  = useState<Date | null>(null)
  const [now, setNow]                  = useState(() => Date.now())
  const [busy, setBusy]                = useState(false)
  const [showForgot, setShowForgot]    = useState(false)

  const isLocked = !!lockedUntil && lockedUntil.getTime() > now
  const remainingMs = isLocked ? lockedUntil!.getTime() - now : 0

  // Tick while a lockout is set so the countdown updates and we can detect the
  // moment it hits zero.
  useEffect(() => {
    if (!lockedUntil) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [lockedUntil])

  // When the lockout expires, clear the lock + error so the "Locked · try again"
  // message and the red dots disappear instead of lingering after the timer ends.
  useEffect(() => {
    if (lockedUntil && lockedUntil.getTime() <= now) {
      setLockedUntil(null)
      setError(null)
    }
  }, [now, lockedUntil])

  useEffect(() => {
    setPinValue('')
    setFirstPin('')
    setStage('first')
    setError(null)
  }, [mode])

  const handleWrong = useCallback((msg: string, until?: Date) => {
    setError(msg)
    if (until) setLockedUntil(until)
    setPinValue('')
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
  }, [])

  const handleCorrect = useCallback(() => {
    setError(null)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
  }, [])

  const submitCreate = useCallback(async (value: string) => {
    if (stage === 'first') {
      setFirstPin(value)
      setPinValue('')
      setStage('confirm')
      Haptics.selectionAsync().catch(() => {})
      return
    }
    if (value !== firstPin) {
      handleWrong("PINs don't match. Try again.")
      setFirstPin('')
      setStage('first')
      return
    }
    setBusy(true)
    try {
      await setPin(value)
      await loadProfile()
      handleCorrect()
      unlock()
      router.replace('/(app)')
    } catch (e) {
      handleWrong((e as Error).message)
      setFirstPin('')
      setStage('first')
    } finally {
      setBusy(false)
    }
  }, [stage, firstPin, handleWrong, handleCorrect, unlock, loadProfile, router])

  const submitEnter = useCallback(async (value: string) => {
    setBusy(true)
    try {
      const r: VerifyPinResult = await verifyPin(value)
      if (r.ok) {
        handleCorrect()
        unlock()
        router.replace('/(app)')
      } else if (r.reason === 'no_pin') {
        router.replace('/(auth)/pin?mode=create')
      } else if (r.reason === 'locked') {
        handleWrong('', r.lockedUntil)          // countdown shows; clears when it ends
      } else if (r.lockedUntil) {
        handleWrong('', r.lockedUntil)          // this wrong attempt tripped a lockout
      } else {
        const left = 3 - (r.attempts % 3)
        handleWrong(left > 0 ? `Wrong PIN. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Wrong PIN.')
      }
    } catch (e) {
      handleWrong((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [handleWrong, handleCorrect, unlock, router])

  const pressDigit = useCallback((d: string) => {
    if (busy || isLocked) return
    if (pin.length >= PIN_LEN) return
    Haptics.selectionAsync().catch(() => {})
    const next = pin + d
    setPinValue(next)
    if (next.length === PIN_LEN) {
      setTimeout(() => {
        if (mode === 'create') submitCreate(next)
        else submitEnter(next)
      }, 120)
    }
  }, [busy, isLocked, pin, mode, submitCreate, submitEnter])

  const pressBackspace = useCallback(() => {
    if (busy || isLocked) return
    if (pin.length === 0) return
    Haptics.selectionAsync().catch(() => {})
    setPinValue(pin.slice(0, -1))
  }, [busy, isLocked, pin])

  // AuthGate handles routing to /(auth)/login once signOut clears `user`.
  // Manual router.replace here caused a double-navigate + a "navigate before
  // mount" warning on rapid taps. Await so SecureStore is wiped before any
  // subsequent tap can race the local session clear.
  const onSignOut = useCallback(async () => { await signOut() }, [signOut])

  const titleText  = mode === 'create'
    ? (stage === 'first' ? 'Create your PIN' : 'Confirm PIN')
    : 'Enter your PIN'

  const subtitleText =
    mode === 'create'
      ? (stage === 'first'
          ? 'Choose a 6-digit PIN to secure your account'
          : 'Re-enter your PIN to confirm')
      : 'Enter your 6-digit PIN to unlock'

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
      {/* Header — back on left, forgot on right (enter mode only) */}
      <View style={styles.header}>
        <Pressable
          onPress={mode === 'create' && stage === 'confirm'
            ? () => { setStage('first'); setPinValue(''); setFirstPin(''); setError(null) }
            : onSignOut}
          hitSlop={12}
          style={styles.iconBtn}
        >
          <Icon name="solar:alt-arrow-left-linear" size={22} color={colors.textMuted} />
        </Pressable>
        {mode === 'enter' ? (
          <Pressable onPress={() => setShowForgot(true)} hitSlop={12}>
            <Text style={styles.forgotText}>Forgot?</Text>
          </Pressable>
        ) : <View style={{ width: 44, height: 44 }} />}
      </View>

      {/* Centered PIN pad — quiet, minimal, whole thing sits mid-screen */}
      <View style={styles.center}>
        <MotiView
          from={{ opacity: 0, translateY: -12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 350, delay: 60 }}
          style={styles.heroText}
        >
          <Text style={styles.title}>{titleText}</Text>
          <Text style={styles.subtitle}>{subtitleText}</Text>
        </MotiView>

        <MotiView
          from={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'timing', duration: 300, delay: 180 }}
          style={styles.dotsRow}
        >
          {Array.from({ length: PIN_LEN }).map((_, i) => (
            <Dot key={i} filled={i < pin.length} errored={!!error && !isLocked} />
          ))}
        </MotiView>

        <View style={styles.messageRow}>
          {isLocked ? (
            <View style={styles.messageRowInner}>
              <Icon name="solar:lock-keyhole-bold" size={13} color={colors.negative} />
              <Text style={styles.messageError}>Locked · Try again in {formatCountdown(remainingMs)}</Text>
            </View>
          ) : error ? (
            <View style={styles.messageRowInner}>
              <Icon name="solar:danger-triangle-bold" size={13} color={colors.negative} />
              <Text style={styles.messageError}>{error}</Text>
            </View>
          ) : (
            <Text style={styles.messagePlaceholder}> </Text>
          )}
        </View>

        <MotiView
          from={{ opacity: 0, translateY: 24 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 380, delay: 240 }}
        >
          <Keypad onDigit={pressDigit} onBackspace={pressBackspace} disabled={busy || isLocked} />
        </MotiView>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Pressable onPress={onSignOut} hitSlop={12} style={styles.signOut}>
          <Text style={styles.signOutMuted}>Not you? </Text>
          <Text style={styles.signOutAction}>Sign out</Text>
        </Pressable>
      </View>

      {showForgot && user?.email && (
        <ForgotPinModal
          email={user.email}
          onClose={() => setShowForgot(false)}
          onSuccess={async () => {
            setShowForgot(false)
            await loadProfile()
            unlock()
            router.replace('/(app)')
          }}
        />
      )}
    </SafeAreaView>
  )
}

// ─────────────────────────────────────────────────────────────
// Dot — small, calm. Bounces once on fill (1 → 1.25 → 1), color
// swaps from empty to solid ink. No pulse rings.
// ─────────────────────────────────────────────────────────────
function Dot({ filled, errored }: { filled: boolean; errored: boolean }) {
  const dotStyles = useThemedStyles(makeDotStyles)
  const scale = useSharedValue(1)

  useEffect(() => {
    if (filled) {
      scale.value = withSequence(
        withTiming(1.25, { duration: 90, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 12, stiffness: 260 }),
      )
    }
  }, [filled, scale])

  // Resolve palette colours on the JS thread. `colors` is a Proxy (theme
  // system), and cloning a Proxy into a Reanimated worklet crashes on iOS/JSI —
  // a new worklet is created every time a dot fills, which is why the pad
  // crashed mid-PIN-entry. The worklet below now captures plain strings only.
  const fillColor = filled ? (errored ? colors.negative : colors.text) : 'transparent'
  const strokeColor = errored ? colors.negative : colors.text

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: fillColor,
    borderColor: strokeColor,
  }))

  return <Animated.View style={[dotStyles.shell, style]} />
}

const makeDotStyles = () => StyleSheet.create({
  shell: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
})

// ─────────────────────────────────────────────────────────────
// Keypad — grey circles, subtle press.
// ─────────────────────────────────────────────────────────────
function Keypad({ onDigit, onBackspace, disabled }: {
  onDigit: (d: string) => void
  onBackspace: () => void
  disabled: boolean
}) {
  const keyStyles = useThemedStyles(makeKeyStyles)
  const rows = useMemo(() => [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['',  '0', 'back'],
  ], [])

  return (
    <View style={keyStyles.grid}>
      {rows.map((row, i) => (
        <View key={i} style={keyStyles.row}>
          {row.map((k, j) => {
            if (k === '') return <View key={j} style={keyStyles.slot} />
            if (k === 'back') {
              return (
                <KeypadButton key={j} disabled={disabled} onPress={onBackspace}>
                  <Icon name="solar:close-square-linear" size={22} color={colors.text} />
                </KeypadButton>
              )
            }
            return (
              <KeypadButton key={j} disabled={disabled} onPress={() => onDigit(k)}>
                <Text style={keyStyles.label}>{k}</Text>
              </KeypadButton>
            )
          })}
        </View>
      ))}
    </View>
  )
}

function KeypadButton({ children, onPress, disabled }: {
  children: React.ReactNode
  onPress: () => void
  disabled: boolean
}) {
  const keyStyles = useThemedStyles(makeKeyStyles)
  const s = useSharedValue(1)
  const o = useSharedValue(1)
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: s.value }],
    opacity: o.value,
  }))

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => { s.value = withSpring(0.88, { damping: 15, stiffness: 400 }); o.value = 0.7 }}
      onPressOut={() => { s.value = withSpring(1, { damping: 12, stiffness: 260 }); o.value = 1 }}
      disabled={disabled}
      style={keyStyles.slot}
      hitSlop={4}
    >
      <Animated.View style={[keyStyles.key, disabled && { opacity: 0.4 }, style]}>
        {children}
      </Animated.View>
    </Pressable>
  )
}

const KEY = 72
const makeKeyStyles = () => StyleSheet.create({
  grid: {
    marginTop: spacing['2xl'],
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
    marginBottom: spacing.md,
  },
  slot: {
    width: KEY,
    height: KEY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  key: {
    width: KEY,
    height: KEY,
    borderRadius: KEY / 2,
    backgroundColor: colors.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 28,
  },
})

// ─────────────────────────────────────────────────────────────
// Forgot-PIN modal
// ─────────────────────────────────────────────────────────────
function ForgotPinModal({ email, onClose, onSuccess }: {
  email: string
  onClose: () => void
  onSuccess: () => void
}) {
  const modalStyles = useThemedStyles(makeModalStyles)
  const [password, setPassword] = useState('')
  const [newPin, setNewPin]     = useState('')
  const [busy, setBusy]         = useState(false)
  const [err, setErr]           = useState<string | null>(null)

  async function submit() {
    if (!password) { setErr('Enter your password'); return }
    if (!/^\d{6}$/.test(newPin)) { setErr('New PIN must be 6 digits'); return }
    setBusy(true); setErr(null)
    try {
      await resetPinWithPassword(email, password, newPin)
      onSuccess()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={modalStyles.root}>
        <View style={modalStyles.card}>
          <Text variant="h2" style={{ marginBottom: spacing.sm }}>Reset PIN</Text>
          <Text variant="small" tone="muted" style={{ marginBottom: spacing.lg }}>
            Confirm your account password to set a new PIN.
          </Text>

          <Text variant="eyebrow" tone="muted" style={{ marginBottom: spacing.sm }}>Account password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={colors.textSubtle}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
            selectionColor={colors.brand}
            style={modalStyles.input}
          />

          <Text variant="eyebrow" tone="muted" style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>New 6-digit PIN</Text>
          <TextInput
            value={newPin}
            onChangeText={(v) => setNewPin(v.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
            placeholderTextColor={colors.textSubtle}
            keyboardType="number-pad"
            maxLength={6}
            secureTextEntry
            selectionColor={colors.brand}
            style={modalStyles.input}
          />

          {err && <Text variant="small" tone="negative" style={{ marginTop: spacing.sm }}>{err}</Text>}

          <View style={modalStyles.actions}>
            <Button title="Cancel" variant="secondary" onPress={onClose} />
            <Button title={busy ? 'Saving…' : 'Reset PIN'} onPress={submit} loading={busy} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const makeModalStyles = () => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.bg,
    borderRadius: radii.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 28,
    elevation: 16,
  },
  input: {
    height: 52,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.bg,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
})

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ─────────────────────────────────────────────────────────────
// Screen styles
// ─────────────────────────────────────────────────────────────
const makeStyles = () => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgotText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: {
    alignItems: 'center',
    marginBottom: spacing['2xl'],
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  messageRow: {
    minHeight: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  messageRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  messageError: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.negative,
    letterSpacing: 0.2,
  },
  messagePlaceholder: {
    fontSize: 12,
    color: 'transparent',
  },
  footer: {
    alignItems: 'center',
    paddingBottom: spacing.sm,
  },
  signOut: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
  },
  signOutMuted: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMuted,
  },
  signOutAction: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.brand,
    letterSpacing: 0.2,
  },
})
