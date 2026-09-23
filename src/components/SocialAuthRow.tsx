import { useState } from 'react'
import { View, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { MotiView } from 'moti'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import { supabase } from '@/lib/supabase'
import { Text, Row, Icon, toast } from '@/ui'
import { colors, spacing } from '@/theme'

// Dismisses the in-app browser tab once the OAuth redirect completes.
WebBrowser.maybeCompleteAuthSession()

// linkedin_oidc = Supabase's LinkedIn (OpenID Connect) provider id.
export type OAuthProvider = 'google' | 'apple' | 'facebook' | 'linkedin_oidc'

// Shared "or continue with" social sign-in row used by BOTH the login and
// register screens, so signing up with iCloud / Gmail / Facebook / LinkedIn is available
// everywhere and there's one code path to maintain.
//
// NOTE: each provider must also be enabled in the Supabase dashboard, and
// `<scheme>://login-callback` (see app.json `scheme`) added to the project's
// allowed Redirect URLs, or the tab returns an error. Apple sign-in only
// completes on iOS.
export function SocialAuthRow({ label = 'or continue with' }: { label?: string }) {
  const router = useRouter()
  const [oauthBusy, setOauthBusy] = useState<OAuthProvider | null>(null)

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
      // AuthGate takes over from the auth-state change (PIN / KYC / app).
      router.replace('/(app)')
    } catch (e) {
      toast.error('Sign-in failed', (e as Error).message)
    } finally {
      setOauthBusy(null)
    }
  }

  return (
    <View>
      <Row align="center" gap="md" style={{ marginTop: spacing.xl, marginBottom: spacing.lg }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        <Text variant="small" tone="subtle">{label}</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      </Row>
      <Row justify="center" gap="2xl">
        <SocialButton provider="google" icon="logos:google-icon" label="Google" onPress={oauth} busy={oauthBusy} />
        <SocialButton provider="apple" icon="mdi:apple" label="Apple" tint={colors.text} onPress={oauth} busy={oauthBusy} />
        <SocialButton provider="facebook" icon="logos:facebook" label="Facebook" onPress={oauth} busy={oauthBusy} />
        <SocialButton provider="linkedin_oidc" icon="logos:linkedin-icon" label="LinkedIn" onPress={oauth} busy={oauthBusy} />
      </Row>
    </View>
  )
}

// Bare brand marks (no card behind them) with a full 48pt tap target.
function SocialButton({ provider, icon, label, tint, onPress, busy }: {
  provider: OAuthProvider
  icon: string
  label: string
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
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Continue with ${label}`}
      style={({ pressed }) => ({
        width: 48, height: 48,
        alignItems: 'center', justifyContent: 'center',
        opacity: pressed ? 0.55 : disabled && !isBusy ? 0.35 : 1,
        transform: [{ scale: pressed ? 0.94 : 1 }],
      })}
    >
      {isBusy
        ? <MotiView from={{ opacity: 0.3 }} animate={{ opacity: 1 }} transition={{ loop: true, type: 'timing', duration: 600 }}><Icon name={icon} size={30} color={tint ?? colors.text} /></MotiView>
        : <Icon name={icon} size={30} color={tint ?? colors.text} />}
    </Pressable>
  )
}
