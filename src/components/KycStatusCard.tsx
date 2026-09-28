import { View } from 'react-native'
import { useRouter } from 'expo-router'
import { useShallow } from 'zustand/react/shallow'
import { useAuthStore } from '@/store/authStore'
import { Text, Icon, Notice } from '@/ui'
import { colors, spacing } from '@/theme'

// Home's single KYC status card — one card per state, so the message always
// matches where the user actually is (replaces "Finish setting up" + the CSCS
// notice, which showed "finish setting up" to people who had already submitted).
//
//   not started  → what KYC involves + that a review follows      [Start verification]
//   skipped      → they skipped; KYC + review needed to invest     [Continue verification]
//   submitted    → under review, with a 3-step progress line       (no action)
//   rejected     → the reviewer's reasons                           [Redo KYC]
//   approved     → nothing (trading unlocked)
export function KycStatusCard({ style }: { style?: object }) {
  const router = useRouter()
  const { kycStatus, cacsStatus, reason } = useAuthStore(useShallow((s) => ({
    kycStatus: s.kycStatus, cacsStatus: s.cacsStatus, reason: s.cacsRejectionReason,
  })))
  const goKyc = () => router.push('/(auth)/kyc' as never)

  if (cacsStatus === 'approved') return null

  if (cacsStatus === 'rejected' || kycStatus === 'rejected') {
    const reasons = (reason ?? '').split('•').map(s => s.trim()).filter(Boolean)
    return (
      <Notice
        tone="error"
        title="Verification unsuccessful"
        body="We couldn’t verify your account. Fix the items below and resubmit. It only takes a few minutes."
        action={{ label: 'Redo KYC', onPress: goKyc }}
        style={style}
      >
        {reasons.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            {reasons.map(r => (
              <View key={r} style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
                <Icon name="solar:close-circle-bold" size={16} color={colors.negative} />
                <Text variant="small" style={{ flex: 1 }}>{r.replace(/^Note:\s*/i, 'Note: ')}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Notice>
    )
  }

  if (kycStatus === 'submitted' || kycStatus === 'verified') {
    return (
      <Notice
        tone="warning"
        icon="solar:clock-circle-bold"
        title="Your details are under review"
        body="We’re verifying your account. This usually takes 1–2 business days. We’ll notify you the moment you can start investing."
        style={style}
      >
        <Steps current={1} labels={['Details submitted', 'Account review', 'Start investing']} />
      </Notice>
    )
  }

  if (kycStatus === 'skipped') {
    return (
      <Notice
        tone="info"
        icon="solar:shield-user-bold"
        title="Verification needed to invest"
        body="You skipped KYC. Complete it (about 5 minutes with your BVN). After you submit, your account is reviewed, usually within 1–2 business days."
        action={{ label: 'Continue verification', onPress: goKyc }}
        style={style}
      />
    )
  }

  return (
    <Notice
      tone="info"
      icon="solar:shield-user-bold"
      title="Complete your KYC to start investing"
      body="Verify your identity with your BVN in about 5 minutes. After you submit, your account is reviewed, usually within 1–2 business days."
      action={{ label: 'Start verification', onPress: goKyc }}
      style={style}
    />
  )
}

// Tiny horizontal progress: done ✓ · current (gold dot) · upcoming (hollow).
function Steps({ current, labels }: { current: number; labels: string[] }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      {labels.map((l, i) => {
        const done = i < current
        const active = i === current
        return (
          <View key={l} style={{ flex: 1, alignItems: 'flex-start' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
              <View style={{
                width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
                backgroundColor: done ? colors.positive : 'transparent',
                borderWidth: done ? 0 : 2, borderColor: active ? colors.accent : colors.border,
              }}>
                {done ? <Icon name="solar:check-read-bold" size={12} color="#FFFFFF" /> : active ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent }} /> : null}
              </View>
              {i < labels.length - 1 ? <View style={{ flex: 1, height: 2, marginHorizontal: 4, backgroundColor: done ? colors.positive : colors.border }} /> : null}
            </View>
            <Text variant="small" tone={active ? 'default' : 'muted'} style={{ marginTop: 6, fontSize: 11.5 }}>{l}</Text>
          </View>
        )
      })}
    </View>
  )
}
