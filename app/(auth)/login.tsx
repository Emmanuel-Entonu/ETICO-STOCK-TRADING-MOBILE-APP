import { useState } from 'react'
import { View, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { Link, useLocalSearchParams } from 'expo-router'
import { MotiView } from 'moti'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import { validateEmail } from '@/lib/validation'
import { Text, Button, Row, Icon, toast } from '@/ui'
import { colors, spacing, shadow } from '@/theme'
import { EticoLogo } from '@/components/EticoMark'
import { CurvedHero } from '@/components/CurvedHero'
import { SocialAuthRow } from '@/components/SocialAuthRow'

export default function LoginScreen() {
  const insets = useSafeAreaInsets()
  const signIn = useAuthStore((s) => s.signIn)
  // Set by the email-confirmation redirect (Supabase → <scheme>://login?confirmed=1)
  // so a freshly-activated user lands here with a clear success banner (#11).
  const { confirmed } = useLocalSearchParams<{ confirmed?: string }>()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // Set when sign-in fails specifically because the email isn't confirmed —
  // drives the friendlier message + "resend activation link" action (#10).
  const [needsConfirm, setNeedsConfirm] = useState(false)
  const [resending, setResending] = useState(false)

  async function submit() {
    const em = validateEmail(email)
    if (!em.ok) { setError(em.error); return }
    if (!password) { setError('Enter your password'); return }
    setLoading(true); setError(null); setNeedsConfirm(false)
    const err = await signIn(em.value, password)
    if (err) {
      setLoading(false)
      // Supabase returns "Email not confirmed" for an unactivated account.
      if (/email not confirmed/i.test(err)) {
        setNeedsConfirm(true)
        setError('Your email isn’t confirmed yet. Check your inbox for the activation link, or resend it below.')
      } else {
        setError(err)
      }
      return
    }
    // Success: do NOT navigate here. Let AuthGate route (PIN / KYC / app) off
    // the auth-state change while the TransitionSplash covers the gap. A manual
    // router.replace('/(app)') raced AuthGate and briefly flashed Home. Keep the
    // button in its loading state — the auth group unmounts under us.
  }

  async function resendActivation() {
    const em = validateEmail(email)
    if (!em.ok) { setError(em.error); return }
    setResending(true)
    try {
      const { error: rErr } = await supabase.auth.resend({ type: 'signup', email: em.value })
      if (rErr) throw rErr
      toast.success('Link sent', `We sent a fresh activation link to ${em.value}.`)
    } catch (e) {
      toast.error('Could not resend', (e as Error).message)
    } finally {
      setResending(false)
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingBottom: spacing['2xl'] }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Curved brand hero: centred ETICO lockup ── */}
          <CurvedHero>
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <EticoLogo size={96} variant="dark" />
            </View>
          </CurvedHero>

          {/* ── Form ── */}
          <MotiView
            from={{ opacity: 0, translateY: 16 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 360 }}
            style={{ paddingHorizontal: spacing['2xl'], paddingTop: spacing.lg }}
          >
            {confirmed ? (
              <Row gap="md" align="center" style={{
                marginBottom: spacing.lg, padding: spacing.md, borderRadius: 14,
                backgroundColor: colors.positiveSubtle,
              }}>
                <Icon name="solar:verified-check-bold" size={20} color={colors.positive} />
                <Text variant="small" style={{ flex: 1, color: colors.text }}>
                  Email confirmed. Sign in to continue.
                </Text>
              </Row>
            ) : null}

            <IconInput
              label="EMAIL"
              icon="solar:letter-linear"
              value={email}
              onChangeText={(t: string) => { setEmail(t); if (error) setError(null) }}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
            />
            <IconInput
              label="PASSWORD"
              icon="solar:lock-password-linear"
              value={password}
              onChangeText={(t: string) => { setPassword(t); if (error) setError(null) }}
              placeholder="••••••••"
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoComplete="password"
              error={error}
              trailing={
                <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={12}>
                  <Icon name={showPw ? 'solar:eye-closed-linear' : 'solar:eye-linear'} size={20} color={colors.textMuted} />
                </Pressable>
              }
            />

            <Row justify="flex-end" style={{ marginTop: -spacing.xs, marginBottom: spacing.xl }}>
              <Link href="/(auth)/reset" asChild>
                <Pressable hitSlop={8}>
                  <Text variant="smallStrong" tone="accent">Forgot password?</Text>
                </Pressable>
              </Link>
            </Row>

            <Button title="Sign In" onPress={submit} loading={loading} />

            {/* Resend activation — only when sign-in failed on an unconfirmed email. */}
            {needsConfirm && (
              <Button
                title={resending ? 'Sending…' : 'Resend activation link'}
                variant="secondary"
                loading={resending}
                onPress={resendActivation}
                style={{ marginTop: spacing.md }}
              />
            )}

            <SocialAuthRow />
          </MotiView>
        </ScrollView>

        {/* Pinned footer — always visible without scrolling. */}
        <View style={{ paddingHorizontal: spacing['2xl'], paddingTop: spacing.sm, paddingBottom: Math.max(insets.bottom, spacing.md) }}>
          <Row justify="center" gap="xs">
            <Text variant="body" tone="muted">New around here?</Text>
            <Link href="/(auth)/register" asChild>
              <Pressable hitSlop={8}>
                <Text variant="bodyStrong" tone="brand">Create account</Text>
              </Pressable>
            </Link>
          </Row>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

// ── Rounded, iconed input (Terra style) ──
function IconInput({ label, icon, trailing, error, ...props }: any) {
  const [focused, setFocused] = useState(false)
  const borderColor = error ? colors.negative : focused ? colors.accent : colors.border
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: colors.textMuted, marginBottom: spacing.sm }}>{label}</Text>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: spacing.md,
        height: 58, borderRadius: 16, paddingHorizontal: spacing.lg,
        backgroundColor: colors.surfaceRaised, borderWidth: 1.5, borderColor,
        ...shadow.sm,
      }}>
        <Icon name={icon} size={20} color={focused ? colors.accent : colors.textMuted} />
        <TextInput
          style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.text, padding: 0 }}
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.accent}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...props}
        />
        {trailing}
      </View>
      {error ? <Text variant="small" tone="negative" style={{ marginTop: spacing.xs }}>{error}</Text> : null}
    </View>
  )
}
