import { useState } from 'react'
import { View, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { Link, useRouter } from 'expo-router'
import { MotiView } from 'moti'
import { useAuthStore } from '@/store/authStore'
import { validateEmail, validatePassword, validateFullName, validateNigerianPhone, passwordRules, passwordScore } from '@/lib/validation'
import { Text, Button, Row, Icon } from '@/ui'
import { colors, spacing, shadow } from '@/theme'
import { EticoMark } from '@/components/EticoMark'
import { CurvedHero } from '@/components/CurvedHero'
import { SocialAuthRow } from '@/components/SocialAuthRow'

type FieldErrors = Partial<Record<'name' | 'email' | 'phone' | 'password' | 'confirm', string>>

const HERO_TEXT = '#FDFCFA'
const HERO_SUB = 'rgba(253,252,250,0.72)'

export default function RegisterScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const signUp = useAuthStore((s) => s.signUp)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  // Clear a single field's error (and any form-level error) as the user edits.
  const clearField = (f: keyof FieldErrors) => {
    if (formError) setFormError(null)
    setErrors(prev => { if (!prev[f]) return prev; const { [f]: _, ...rest } = prev; return rest })
  }

  async function submit() {
    // Validate every field up-front and attach each error to ITS OWN input,
    // instead of surfacing a single message under the password box (#5).
    const name = validateFullName(fullName)
    const em   = validateEmail(email)
    const ph   = validateNigerianPhone(phone)
    const pw   = validatePassword(password)
    const next: FieldErrors = {}
    if (!name.ok) next.name = name.error
    if (!em.ok)   next.email = em.error
    if (!ph.ok)   next.phone = ph.error
    if (!pw.ok)   next.password = pw.error
    else if (confirm !== password) next.confirm = 'Passwords do not match'
    setErrors(next)
    setFormError(null)
    if (Object.keys(next).length > 0) return
    // Redundant guard for the type-narrower — every branch above already
    // populated `next` on failure, so we never reach here unless all are ok.
    if (!name.ok || !em.ok || !ph.ok || !pw.ok) return

    setLoading(true)
    const { error: err, signedIn } = await signUp(em.value, pw.value, name.value, ph.value)
    setLoading(false)
    if (err) setFormError(err)
    // Signed in (pre-confirmed account): AuthGate moves us on to PIN setup.
    // Only the legacy email-confirmation fallback needs the "check your email" screen.
    else if (!signedIn) setSuccess(true)
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
              onChangeText={(t: string) => { setFullName(t); clearField('name') }}
              placeholder="As it appears on your ID"
              autoCapitalize="words"
              autoComplete="name"
              error={errors.name}
            />
            <IconInput
              label="EMAIL"
              icon="solar:letter-linear"
              value={email}
              onChangeText={(t: string) => { setEmail(t); clearField('email') }}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              error={errors.email}
            />
            <IconInput
              label="PHONE NUMBER"
              icon="solar:smartphone-linear"
              value={phone}
              onChangeText={(t: string) => { setPhone(t); clearField('phone') }}
              placeholder="e.g. 08012345678"
              keyboardType="phone-pad"
              autoComplete="tel"
              error={errors.phone}
            />
            <IconInput
              label="PASSWORD"
              icon="solar:lock-password-linear"
              value={password}
              onChangeText={(t: string) => { setPassword(t); clearField('password') }}
              placeholder="Create a strong password"
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoComplete="password-new"
              error={errors.password}
              trailing={
                <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={12}>
                  <Icon name={showPw ? 'solar:eye-closed-linear' : 'solar:eye-linear'} size={20} color={colors.textMuted} />
                </Pressable>
              }
            />

            <PasswordStrength password={password} />

            <IconInput
              label="CONFIRM PASSWORD"
              icon="solar:lock-password-linear"
              value={confirm}
              onChangeText={(t: string) => { setConfirm(t); clearField('confirm') }}
              placeholder="Re-enter your password"
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoComplete="password-new"
              error={errors.confirm}
            />

            {formError ? (
              <View style={{ marginBottom: spacing.md }}>
                <Text variant="small" tone="negative">{formError}</Text>
                {/* One account per email: point them to the right door instead
                    of a dead end. */}
                {/already exists/i.test(formError) ? (
                  <Row gap="lg" style={{ marginTop: spacing.sm }}>
                    <Pressable onPress={() => router.replace('/(auth)/login')} hitSlop={8}>
                      <Text variant="smallStrong" tone="accent">Sign in</Text>
                    </Pressable>
                    <Pressable onPress={() => router.push({ pathname: '/(auth)/reset', params: { email: email.trim() } } as never)} hitSlop={8}>
                      <Text variant="smallStrong" tone="accent">Reset password</Text>
                    </Pressable>
                  </Row>
                ) : null}
              </View>
            ) : null}

            <Button title="Create Account" onPress={submit} loading={loading} style={{ marginTop: spacing.sm }} />
            <Text variant="small" tone="subtle" align="center" style={{ marginTop: spacing.md }}>
              By continuing, you agree to ETICO's{' '}
              <Text variant="smallStrong" tone="brand" onPress={() => router.push('/terms' as never)}>Terms</Text>
              {' '}and{' '}
              <Text variant="smallStrong" tone="brand" onPress={() => router.push('/privacy' as never)}>Privacy Policy</Text>.
            </Text>

            <SocialAuthRow label="or sign up with" />
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

// Live password strength meter + requirements checklist. Renders once the user
// starts typing; the bar and each row update as they type.
function PasswordStrength({ password }: { password: string }) {
  if (!password) return null
  const rules = passwordRules(password)
  const score = passwordScore(password)
  const label = score <= 2 ? 'Weak' : score < 5 ? 'Medium' : 'Strong'
  const barColor = score <= 2 ? colors.negative : score < 5 ? colors.warning : colors.positive

  const items = [
    { ok: rules.length,  label: 'At least 8 characters' },
    { ok: rules.number,  label: 'At least 1 number' },
    { ok: rules.lower,   label: 'At least 1 lowercase letter' },
    { ok: rules.upper,   label: 'At least 1 uppercase letter' },
    { ok: rules.special, label: 'At least 1 special character' },
  ]

  return (
    <View style={{ marginTop: -spacing.sm, marginBottom: spacing.lg }}>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.bgSubtle, overflow: 'hidden' }}>
        <View style={{ height: 6, borderRadius: 3, width: `${(score / 5) * 100}%`, backgroundColor: barColor }} />
      </View>
      <Text variant="smallStrong" style={{ marginTop: spacing.md, color: colors.text }}>
        {score < 5 ? `${label} password. Must contain:` : 'Strong password'}
      </Text>
      <View style={{ marginTop: spacing.sm, gap: 6 }}>
        {items.map((it) => (
          <Row key={it.label} gap="sm" align="center">
            <Icon
              name={it.ok ? 'solar:check-circle-bold' : 'solar:close-circle-bold'}
              size={16}
              color={it.ok ? colors.positive : colors.textSubtle}
            />
            <Text variant="small" style={{ color: it.ok ? colors.positive : colors.textMuted }}>{it.label}</Text>
          </Row>
        ))}
      </View>
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
