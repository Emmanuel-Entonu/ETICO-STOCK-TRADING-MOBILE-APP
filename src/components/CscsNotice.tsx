import { View } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuthStore } from '@/store/authStore'
import { Text, Button, Icon, Card, Row } from '@/ui'
import { colors, spacing, radii } from '@/theme'

// CSCS review status for the user. Shown once identity KYC is done:
//   • pending / not_submitted → "under review by PAC Securities"
//   • rejected → the reviewer's reason(s) + a "Redo KYC" button
// Hidden once approved (trading is unlocked). Mirrors the web CscsNotice; the
// reviewer stores multiple reasons joined by " • ", so we split on "•".
export function CscsNotice({ topSpacing = false }: { topSpacing?: boolean }) {
  const router = useRouter()
  const kycStatus = useAuthStore(s => s.kycStatus)
  const cacsStatus = useAuthStore(s => s.cacsStatus)
  const reason = useAuthStore(s => s.cacsRejectionReason)

  // Only relevant after identity KYC is done and before CSCS is approved.
  if (kycStatus !== 'verified' || cacsStatus === 'approved') return null

  const spacer = topSpacing
    ? { marginTop: spacing.lg }
    : { marginBottom: spacing.lg }

  if (cacsStatus === 'rejected') {
    const reasons = (reason ?? '').split('•').map(s => s.trim()).filter(Boolean)
    return (
      <Card style={{ backgroundColor: colors.negativeSubtle, borderColor: 'transparent', ...spacer }}>
        <Row gap="md" align="flex-start">
          <Icon name="solar:shield-warning-bold" size={20} color={colors.negative} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong" tone="negative">Your CSCS verification was rejected</Text>
            <Text variant="small" tone="muted" style={{ marginTop: spacing.xs }}>
              PAC Securities couldn’t approve your account for these reasons. Fix them and redo KYC to try again.
            </Text>
            {reasons.length > 0 && (
              <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                {reasons.map(r => (
                  <Row key={r} gap="sm" align="flex-start">
                    <View style={{ width: 6, height: 6, borderRadius: radii.pill, backgroundColor: colors.negative, marginTop: 7 }} />
                    <Text variant="small" style={{ flex: 1 }}>{r}</Text>
                  </Row>
                ))}
              </View>
            )}
            <View style={{ marginTop: spacing.lg }}>
              <Button title="Redo KYC" onPress={() => router.push('/(auth)/kyc' as never)} />
            </View>
          </View>
        </Row>
      </Card>
    )
  }

  // pending or not_submitted (identity done, awaiting the PAC reviewer)
  return (
    <Card style={{ backgroundColor: colors.warningSubtle, borderColor: 'transparent', ...spacer }}>
      <Row gap="md" align="flex-start">
        <Icon name="solar:clock-circle-bold" size={20} color={colors.warning} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">CSCS account under review</Text>
          <Text variant="small" tone="muted" style={{ marginTop: spacing.xs }}>
            Your details are with PAC Securities for verification. Trading unlocks
            automatically once your CSCS account is approved — usually within 1–2
            business days.
          </Text>
        </View>
      </Row>
    </Card>
  )
}
