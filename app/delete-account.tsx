import { useState } from 'react'
import { View, ScrollView, Pressable, Alert } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Text, Card, Row, Button, Icon, toast } from '@/ui'
import { colors, spacing, radii } from '@/theme'
import { useShallow } from 'zustand/react/shallow'

// Google Play requires account-based apps to let users request account + data
// deletion from within the app. This submits a deletion request (stamps the
// profile via a SECURITY DEFINER RPC), then signs the user out. Financial
// records that we're legally required to retain (SEC / AML) are kept for the
// mandated period and then purged — this is disclosed below.
const WHAT_HAPPENS = [
  'Your profile, watchlist and app preferences are scheduled for deletion.',
  'Your login is disabled and you are signed out on this device.',
  'Trading and wallet records required by law (SEC / anti-money-laundering) are retained for the mandated period, then permanently deleted.',
  'Any settled cash should be withdrawn first. Contact support if you need help.',
]

export default function DeleteAccountScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { signOut } = useAuthStore(useShallow((s) => ({ signOut: s.signOut })))
  const [busy, setBusy] = useState(false)

  const confirm = () => {
    Alert.alert(
      'Delete your account?',
      'This submits a permanent deletion request and signs you out. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: runDelete },
      ],
    )
  }

  async function runDelete() {
    setBusy(true)
    try {
      const { error } = await supabase.rpc('request_account_deletion')
      if (error) throw new Error(error.message)
      toast.info('Request received', 'Your account is scheduled for deletion. You have been signed out.')
      await signOut()   // AuthGate redirects to the welcome screen
    } catch (e) {
      setBusy(false)
      Alert.alert('Could not delete account', String((e as Error).message) + '\n\nPlease email support@etico.ng and we will process it.')
    }
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm }}>
        <Row gap="md" align="center">
          <Pressable onPress={() => router.back()} hitSlop={12} style={{ width: 40, height: 40, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSubtle }}>
            <Icon name="solar:arrow-left-linear" size={20} color={colors.text} />
          </Pressable>
          <Text variant="h2">Delete account</Text>
        </Row>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing['3xl'] }}>
        <Card style={{ backgroundColor: colors.negativeSubtle, borderColor: 'transparent' }}>
          <Row gap="md" align="flex-start">
            <Icon name="solar:danger-triangle-bold" size={22} color={colors.negative} />
            <Text variant="small" style={{ flex: 1, color: colors.text }}>
              Deleting your account is permanent. Please read what happens before you continue.
            </Text>
          </Row>
        </Card>

        <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
          {WHAT_HAPPENS.map(line => (
            <Row key={line} gap="sm" align="flex-start">
              <View style={{ width: 6, height: 6, borderRadius: radii.pill, backgroundColor: colors.textMuted, marginTop: 7 }} />
              <Text variant="small" tone="muted" style={{ flex: 1 }}>{line}</Text>
            </Row>
          ))}
        </View>

        <Text variant="small" tone="subtle" style={{ marginTop: spacing.xl, lineHeight: 20 }}>
          You can also request deletion at etico.ng/delete-account or by emailing
          support@etico.ng from your registered address.
        </Text>
      </ScrollView>

      <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: Math.max(insets.bottom, spacing.lg), gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg }}>
        <Pressable
          onPress={confirm}
          disabled={busy}
          style={({ pressed }) => ({
            height: 54, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center',
            opacity: busy ? 0.6 : 1,
            backgroundColor: pressed ? colors.negativeSubtle : colors.negative,
          })}
        >
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.textInverse }}>
            {busy ? 'Submitting…' : 'Delete my account'}
          </Text>
        </Pressable>
        <Button title="Cancel" variant="secondary" onPress={() => router.back()} disabled={busy} />
      </View>
    </SafeAreaView>
  )
}
