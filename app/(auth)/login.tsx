import { useState } from 'react'
import { View, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { Link, useRouter } from 'expo-router'
import { MotiView } from 'moti'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import { validateEmail } from '@/lib/validation'
import { Text, Button, Row, Icon, toast } from '@/ui'
import { colors, spacing, shadow } from '@/theme'
import { EticoLogo } from '@/components/EticoMark'
import { CurvedHero } from '@/components/CurvedHero'

// Dismisses the in-app browser tab once the OAuth redirect completes.
WebBrowser.maybeCompleteAuthSession()

type OAuthProvider = 'google' | 'apple' | 'facebook'

export default function LoginScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const signIn = useAuthStore((s) => s.signIn)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [oauthBusy, setOauthBusy] = useState<OAuthProvider | null>(null)

  async function submit() {
    const em = validateEmail(email)
    if (!em.ok) { setError(em.error); return }
    if (!password) { setError('Enter your password'); return }
    setLoading(true); setError(null)
    const err = await signIn(em.value, password)
    if (err) { setLoading(false); setError(err); return }
    // Success: do NOT navigate here. Let AuthGate route (PIN / KYC / app) off
    // the auth-state change while the TransitionSplash covers the gap. A manual
    // router.replace('/(app)') raced AuthGate and briefly flashed Home. Keep the
    // button in its loading state — the auth group unmounts under us.
  }

  // Supabase OAuth via an in-app browser tab. Requires the provider to be
  // enabled in the Supabase dashboard, and `niqra://login-callback` added to
  // the project's allowed Redirect URLs. Handles both PKCE (?code=) and
  // implicit (#access_token=) responses.
  async function oauth(provider: OAuthProvider) {
    if (oauthBusy) return
    setOauthBusy(provider)
    try {
      const redirectTo = Linking.createURL('login-callback')
      const { data, error: oErr } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      })
      if (oErr || !data?.url) throw oErr ?? new Error('Could not start sign-in')

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
      if (result.type !== 'success' || !result.url) return // cancelled / dismissed

      const parsed = Linking.parse(result.url)
      const code = parsed.queryParams?.code as string | undefined
      if (code) {
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(code)
        if (exErr) throw exErr
      } else {
        const fragment = result.url.includes('#') ? result.url.split('#')[1] : ''
        const params = new URLSearchParams(fragment)
        const access_token = params.get('access_token')
        const refresh_token = params.get('refresh_token')
        if (!access_token || !refresh_token) throw new Error('No session returned from provider')
        const { error: sErr } = await supabase.auth.setSession({ access_token, refresh_token })
        if (sErr) throw sErr
      }
      router.replace('/(app)')
    } catch (e) {
      toast.error('Sign-in failed', (e as Error).message)
    } finally {
      setOauthBusy(null)
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

            {/* or continue with */}
            <Row align="center" gap="md" style={{ marginTop: spacing.xl, marginBottom: spacing.lg }}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
              <Text variant="small" tone="subtle">or continue with</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            </Row>

            <Row gap="md">
              <SocialButton provider="google" icon="logos:google-icon" onPress={oauth} busy={oauthBusy} />
              <SocialButton provider="apple" icon="mdi:apple" tint={colors.text} onPress={oauth} busy={oauthBusy} />
              <SocialButton provider="facebook" icon="logos:facebook" onPress={oauth} busy={oauthBusy} />
            </Row>
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

function SocialButton({ provider, icon, tint, onPress, busy }: {
  provider: OAuthProvider
  icon: string
  tint?: string
  onPress: (p: OAuthProvider) => void
  busy: OAuthProvider | null
}) {
  const isBusy = busy === provider
  const disabled = busy !== null
  return (
    <Pressable
      onPress={() => onPress(provider)}
      disabled={disabled}
      style={({ pressed }) => ({
        flex: 1, height: 56, borderRadius: 16,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: pressed ? colors.bgMuted : colors.surfaceRaised,
        borderWidth: 1.5, borderColor: colors.border,
        opacity: disabled && !isBusy ? 0.5 : 1,
      })}
    >
      {isBusy
        ? <MotiView from={{ opacity: 0.4 }} animate={{ opacity: 1 }} transition={{ loop: true, type: 'timing', duration: 600 }} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.bgSubtle }} />
        : <Icon name={icon} size={24} color={tint ?? colors.text} />}
    </Pressable>
  )
}
