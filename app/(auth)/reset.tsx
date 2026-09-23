import { useEffect, useRef, useState } from 'react'
import { View, KeyboardAvoidingView, Platform, Pressable, TextInput, ScrollView } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { MotiView } from 'moti'
import { supabase } from '@/lib/supabase'
import { validateEmail, validatePassword } from '@/lib/validation'
import { requestPasswordOtp, resetPasswordWithOtp } from '@/lib/passwordReset'
import { Text, Button, Icon } from '@/ui'
import { colors, spacing, radii } from '@/theme'

// In-app OTP password reset, styled like the KYC flow. Two stages:
//   1. email  → we email a 6-digit code
//   2. code + new password → verify + set password → auto sign-in
type Stage = 1 | 2

export default function ResetScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [stage, setStage] = useState<Stage>(1)

  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendSec, setResendSec] = useState(0)

  // Resend countdown.
  useEffect(() => {
    if (resendSec <= 0) return
    const id = setInterval(() => setResendSec(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [resendSec])

  async function sendCode() {
    const em = validateEmail(email)
    if (!em.ok) { setError(em.error); return }
    setLoading(true); setError(null)
    await requestPasswordOtp(em.value)   // always resolves (no enumeration)
    setLoading(false)
    setResendSec(30)
    setStage(2)
  }

  async function submitReset() {
    const em = validateEmail(email)
    if (!em.ok) { setError(em.error); return }
    if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit code from your email'); return }
    const pw = validatePassword(password)
    if (!pw.ok) { setError(pw.error); return }
    if (confirm !== password) { setError('Passwords do not match'); return }

    setLoading(true); setError(null)
    try {
      await resetPasswordWithOtp(em.value, code, pw.value)
      // Sign the user straight in with the new password; AuthGate takes it from here.
      const { error: signErr } = await supabase.auth.signInWithPassword({ email: em.value, password: pw.value })
      if (signErr) { router.replace('/(auth)/login'); return }
      // AuthGate redirects on the session change; nothing else to do.
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const meta = stage === 1
    ? { title: 'Reset password', subtitle: 'Enter your account email and we’ll send a 6-digit code.' }
    : { title: 'Enter the code', subtitle: `We sent a 6-digit code to ${email}. Enter it and choose a new password.` }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* Top bar: back + step counter + progress */}
        <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 40 }}>
            <Pressable
              onPress={() => (stage === 2 ? (setStage(1), setError(null)) : router.replace('/(auth)/login'))}
              hitSlop={12}
              style={styles.backBtn()}
            >
              <Icon name="solar:arrow-left-linear" size={20} color={colors.text} />
            </Pressable>
            <Text variant="eyebrow" tone="muted">STEP {stage} / 2</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: spacing.md }}>
            {[1, 2].map(n => (
              <MotiView
                key={n}
                animate={{ backgroundColor: n <= stage ? (n === stage ? colors.accent : colors.brand) : colors.border }}
                transition={{ type: 'timing', duration: 260 }}
                style={{ flex: 1, height: 5, borderRadius: radii.pill }}
              />
            ))}
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing['2xl'], paddingBottom: spacing['3xl'] }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <MotiView key={stage} from={{ opacity: 0, translateX: 16 }} animate={{ opacity: 1, translateX: 0 }} transition={{ type: 'timing', duration: 280 }}>
            <Text variant="display" style={{ fontSize: 30, lineHeight: 36, letterSpacing: -1 }}>{meta.title}</Text>
            <Text variant="body" tone="muted" style={{ marginTop: spacing.sm }}>{meta.subtitle}</Text>

            <View style={{ height: spacing['2xl'] }} />

            {stage === 1 ? (
              <UField
                label="Email"
                value={email}
                onChangeText={(v: string) => { setEmail(v); setError(null) }}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                big
                error={error}
              />
            ) : (
              <View>
                <Text variant="eyebrow" tone="muted" style={{ marginBottom: spacing.md }}>6-DIGIT CODE</Text>
                <OtpBoxes value={code} onChange={(v) => { setCode(v); setError(null) }} disabled={loading} error={!!error} />

                <View style={{ height: spacing['2xl'] }} />

                <UField
                  label="New password"
                  value={password}
                  onChangeText={(v: string) => { setPassword(v); setError(null) }}
                  placeholder="Create a strong password"
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  autoComplete="password-new"
                  trailing={
                    <Pressable onPress={() => setShowPw(v => !v)} hitSlop={10}>
                      <Icon name={showPw ? 'solar:eye-closed-linear' : 'solar:eye-linear'} size={20} color={colors.textMuted} />
                    </Pressable>
                  }
                />
                <UField
                  label="Confirm password"
                  value={confirm}
                  onChangeText={(v: string) => { setConfirm(v); setError(null) }}
                  placeholder="Re-enter your password"
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  autoComplete="password-new"
                />

                {error ? <Text variant="small" tone="negative" style={{ marginTop: -spacing.md, marginBottom: spacing.lg }}>{error}</Text> : null}

                <Pressable
                  onPress={() => { if (resendSec === 0) sendCode() }}
                  disabled={resendSec > 0}
                  hitSlop={8}
                  style={{ alignSelf: 'flex-start' }}
                >
                  <Text variant="smallStrong" style={{ color: resendSec > 0 ? colors.textSubtle : colors.accent }}>
                    {resendSec > 0 ? `Resend code in ${resendSec}s` : 'Resend code'}
                  </Text>
                </Pressable>
              </View>
            )}
          </MotiView>
        </ScrollView>

        {/* Sticky bottom CTA */}
        <View style={[styles.bottomBar(), { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          {stage === 1 ? (
            <Button title={loading ? 'Sending…' : 'Send code'} onPress={sendCode} loading={loading} disabled={loading} />
          ) : (
            <Button title={loading ? 'Resetting…' : 'Reset password'} onPress={submitReset} loading={loading} disabled={loading} />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function UField({ label, error, trailing, big, ...props }: any) {
  const [focused, setFocused] = useState(false)
  const borderColor = error ? colors.negative : focused ? colors.accent : colors.borderStrong
  return (
    <View style={{ marginBottom: spacing['2xl'] }}>
      <Text variant="eyebrow" tone="muted" style={{ marginBottom: spacing.md }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: borderColor, paddingBottom: spacing.sm }}>
        <TextInput
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.accent}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ flex: 1, fontSize: big ? 22 : 18, fontWeight: '600', color: colors.text, padding: 0 }}
          {...props}
        />
        {trailing ? <View style={{ marginLeft: spacing.md }}>{trailing}</View> : null}
      </View>
      {error ? <Text variant="small" tone="negative" style={{ marginTop: spacing.sm }}>{error}</Text> : null}
    </View>
  )
}

function OtpBoxes({ value, onChange, disabled, error }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; error?: boolean
}) {
  const refs = useRef<Array<TextInput | null>>([])
  const chars = Array.from({ length: 6 }, (_, i) => value[i] ?? '')
  const setDigit = (i: number, t: string) => {
    const d = t.replace(/\D/g, '').slice(-1)
    const arr = [...chars]; arr[i] = d
    onChange(arr.join(''))
    if (d && i < 5) refs.current[i + 1]?.focus()
  }
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {chars.map((ch, i) => (
        <TextInput
          key={i}
          ref={(r) => { refs.current[i] = r }}
          value={ch}
          onChangeText={(t) => setDigit(i, t)}
          onKeyPress={(e) => { if (e.nativeEvent.key === 'Backspace' && !ch && i > 0) refs.current[i - 1]?.focus() }}
          keyboardType="number-pad"
          maxLength={1}
          editable={!disabled}
          selectionColor={colors.accent}
          style={{
            width: 46, height: 58, textAlign: 'center', fontSize: 24, fontWeight: '700',
            color: colors.text, borderBottomWidth: 2,
            borderBottomColor: error ? colors.negative : ch ? colors.accent : colors.borderStrong,
          }}
        />
      ))}
    </View>
  )
}

// Functions (not baked objects) so the colors proxy is read fresh per render —
// keeps dark mode correct.
const styles = {
  backBtn: () => ({
    width: 40, height: 40, borderRadius: radii.pill,
    alignItems: 'center' as const, justifyContent: 'center' as const,
    backgroundColor: colors.bgSubtle,
  }),
  bottomBar: () => ({
    paddingHorizontal: spacing.xl, paddingTop: spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.bg,
  }),
}
