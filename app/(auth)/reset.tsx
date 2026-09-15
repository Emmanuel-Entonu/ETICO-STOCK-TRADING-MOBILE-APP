import { useState } from 'react'
import { View, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { MotiView } from 'moti'
import { supabase } from '@/lib/supabase'
import { validateEmail } from '@/lib/validation'
import { Text, Input, Button, Stack, Icon } from '@/ui'
import { colors, spacing } from '@/theme'
import { EticoLogo } from '@/components/EticoMark'

export default function ResetScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function submit() {
    const em = validateEmail(email)
    if (!em.ok) { setError(em.error); return }
    setLoading(true); setError(null)
    const { error: err } = await supabase.auth.resetPasswordForEmail(em.value)
    setLoading(false)
    if (err) setError(err.message)
    else setSent(true)
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing['3xl'] }}
        keyboardShouldPersistTaps="handled"
      >
        <MotiView
          from={{ opacity: 0, translateY: -8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 320 }}
          style={{ paddingTop: spacing['3xl'], paddingBottom: spacing.xl, alignItems: 'center' }}
        >
          <EticoLogo size={104} />
        </MotiView>

        <View style={{ flex: 1, justifyContent: 'center' }}>
          <MotiView
            from={{ opacity: 0, translateY: 12 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 380, delay: 120 }}
          >
            {sent && (
              <View style={{
                width: 72, height: 72, borderRadius: 36,
                backgroundColor: colors.accentSubtle,
                alignItems: 'center', justifyContent: 'center',
                marginBottom: spacing.xl,
              }}>
                <Icon name="solar:letter-bold" size={32} color={colors.accent} />
              </View>
            )}
            <Text variant="display" style={{ letterSpacing: -1.4, lineHeight: 42, fontSize: 36 }}>
              {sent ? 'Check your inbox' : 'Reset password'}
            </Text>
            <Text variant="body" tone="muted" style={{ marginTop: spacing.md }}>
              {sent
                ? `We sent a reset link to ${email}. Follow it to set a new password.`
                : "Enter the email tied to your account and we'll send a reset link."}
            </Text>
          </MotiView>

          {!sent && (
            <MotiView
              from={{ opacity: 0, translateY: 16 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 380, delay: 220 }}
              style={{ marginTop: spacing['3xl'] }}
            >
              <Stack gap="md">
                <Input
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  error={error}
                />
                <Button title="Send reset link" onPress={submit} loading={loading} />
              </Stack>
            </MotiView>
          )}

          <MotiView
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: 'timing', duration: 400, delay: 320 }}
            style={{ marginTop: spacing['2xl'] }}
          >
            <Button
              title={sent ? 'Back to Sign In' : 'Cancel'}
              variant="secondary"
              onPress={() => router.replace('/(auth)/login')}
            />
          </MotiView>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
