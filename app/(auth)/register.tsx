import { useState } from 'react'
import { View, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { Link, useRouter } from 'expo-router'
import { MotiView } from 'moti'
import { useAuthStore } from '@/store/authStore'
import { validateEmail, validatePassword, validateFullName } from '@/lib/validation'
import { Text, Button, Row, Icon } from '@/ui'
import { colors, spacing, shadow } from '@/theme'
import { EticoMark } from '@/components/EticoMark'
import { CurvedHero } from '@/components/CurvedHero'

const HERO_TEXT = '#FDFCFA'
const HERO_SUB = 'rgba(253,252,250,0.72)'

export default function RegisterScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const signUp = useAuthStore((s) => s.signUp)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  async function submit() {
    const name = validateFullName(fullName)
    if (!name.ok) { setError(name.error); return }
    const em = validateEmail(email)
    if (!em.ok) { setError(em.error); return }
    const pw = validatePassword(password)
    if (!pw.ok) { setError(pw.error); return }
    setLoading(true); setError(null)
    const err = await signUp(em.value, pw.value, name.value)
    setLoading(false)
    if (err) setError(err)
    else setSuccess(true)
  }

  if (success) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: spacing['2xl'], justifyContent: 'center' }}>
          <MotiView
            from={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 16, stiffness: 220 }}
            style={{ alignItems: 'center' }}
          >
            <View style={{
              width: 92, height: 92, borderRadius: 46,
              backgroundColor: colors.accentSubtle,
              alignItems: 'center', justifyContent: 'center',
              marginBottom: spacing.xl,
            }}>
              <Icon name="solar:letter-bold" size={38} color={colors.accent} />
            </View>
            <Text variant="h1" align="center">Check your email</Text>
            <Text variant="body" tone="muted" align="center" style={{ marginTop: spacing.md, maxWidth: 320 }}>
              We sent a confirmation link to <Text variant="bodyStrong">{email}</Text>. Open it to activate your account, then sign in.
            </Text>
            <Button title="Back to Sign In" onPress={() => router.replace('/(auth)/login')} variant="secondary" style={{ marginTop: spacing['2xl'], alignSelf: 'stretch' }} />
          </MotiView>
        </ScrollView>
      </SafeAreaView>
    )
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
          {/* ── Curved brand hero ── */}
          <CurvedHero>
            <View style={{
              width: 54, height: 54, borderRadius: 16,
              backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center',
              ...shadow.sm,
            }}>
              <EticoMark size={26} variant="light" />
            </View>
            <Text style={{ color: HERO_TEXT, fontSize: 34, fontWeight: '800', letterSpacing: -1.2, lineHeight: 38, marginTop: spacing['2xl'] }}>
              Create{'\n'}account
            </Text>
            <Text style={{ color: HERO_SUB, fontSize: 14, fontWeight: '500', marginTop: spacing.sm }}>
              SEC-licensed investing on the NGX.
            </Text>
          </CurvedHero>

          {/* ── Form ── */}
          <MotiView
            from={{ opacity: 0, translateY: 16 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 360 }}
            style={{ paddingHorizontal: spacing['2xl'], paddingTop: spacing.lg }}
          >
            <IconInput
              label="FULL NAME"
              icon="solar:user-linear"
              value={fullName}
              onChangeText={(t: string) => { setFullName(t); if (error) setError(null) }}
              placeholder="As it appears on your ID"
              autoCapitalize="words"
              autoComplete="name"
            />
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
              placeholder="At least 6 characters"
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoComplete="password-new"
              error={error}
              trailing={
                <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={12}>
                  <Icon name={showPw ? 'solar:eye-closed-linear' : 'solar:eye-linear'} size={20} color={colors.textMuted} />
                </Pressable>
              }
            />

            <Button title="Create Account" onPress={submit} loading={loading} style={{ marginTop: spacing.sm }} />
            <Text variant="small" tone="subtle" align="center" style={{ marginTop: spacing.md }}>
              By continuing, you agree to ETICO's Terms and Privacy Policy.
            </Text>
          </MotiView>
        </ScrollView>

        {/* Pinned footer — always visible without scrolling. */}
        <View style={{ paddingHorizontal: spacing['2xl'], paddingTop: spacing.sm, paddingBottom: Math.max(insets.bottom, spacing.md) }}>
          <Row justify="center" gap="xs">
            <Text variant="body" tone="muted">Already have an account?</Text>
            <Link href="/(auth)/login" asChild>
              <Pressable hitSlop={8}>
                <Text variant="bodyStrong" tone="brand">Sign in</Text>
              </Pressable>
            </Link>
          </Row>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

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
