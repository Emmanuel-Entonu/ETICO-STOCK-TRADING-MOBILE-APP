import { useState } from 'react'
import { View, ScrollView, Pressable, Modal } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { MotiView } from 'moti'
import { useAuthStore } from '@/store/authStore'
import { Text, Card, Row, Button, Divider, Icon, toast } from '@/ui'
import { colors, spacing, radii } from '@/theme'
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar'
import { EticoMark } from '@/components/EticoMark'

export default function AccountScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user, signOut, kycStatus, cacsStatus, pacAccountId } = useAuthStore()
  const [confirmOut, setConfirmOut] = useState(false)

  const email = user?.email ?? '—'
  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? ''
  const firstName = fullName.split(' ')[0] || user?.email?.split('@')[0] || '?'
  const displayName = fullName || firstName
  const initial = (firstName[0] ?? '?').toUpperCase()

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE + spacing.lg }} showsVerticalScrollIndicator={false}>

        {/* Small brand bar */}
        <Row justify="center" align="center" style={{ paddingTop: spacing.lg, paddingBottom: spacing.sm }}>
          <EticoMark size={22} />
        </Row>

        {/* Profile hero — centred, gold-ringed avatar. */}
        <MotiView
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 340 }}
          style={{ alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xl }}
        >
          <View style={{ padding: 3, borderRadius: 999, borderWidth: 2, borderColor: colors.accent }}>
            <View style={avatarStyle}>
              <Text style={{ color: colors.textOnBrand, fontSize: 28, lineHeight: 34, fontWeight: '800', textAlign: 'center', textAlignVertical: 'center', includeFontPadding: false }}>{initial}</Text>
            </View>
          </View>
          <Text variant="h2" style={{ marginTop: spacing.md }} numberOfLines={1}>{displayName}</Text>
          <Text variant="small" tone="muted" style={{ marginTop: 2 }} numberOfLines={1}>{email}</Text>
        </MotiView>

        {/* Verification status */}
        <SectionHeader label="VERIFICATION" />
        <View style={{ paddingHorizontal: spacing.xl }}>
          <Card padded={false}>
            <StatusRow
              icon="solar:shield-check-bold"
              label="KYC Identity"
              status={kycStatus}
            />
            <Divider my="xs" />
            <StatusRow
              icon="solar:document-text-bold"
              label="NGX / CSCS"
              status={cacsStatus}
            />
            <Divider my="xs" />
            <StatusRow
              icon="solar:card-2-bold"
              label="Brokerage account"
              status={pacAccountId ? 'linked' : 'not_linked'}
            />
          </Card>
        </View>

        {/* Preferences (placeholder rows for future settings) */}
        <SectionHeader label="PREFERENCES" />
        <View style={{ paddingHorizontal: spacing.xl }}>
          <Card padded={false}>
            <MenuRow
              icon="solar:bell-linear"
              label="Notifications"
              onPress={() => toast.info('Coming soon', 'Notification preferences will land in the next update.')}
            />
            <Divider my="xs" />
            <MenuRow
              icon="solar:lock-password-linear"
              label="Security"
              onPress={() => toast.info('Coming soon', 'Change password and biometric login coming next.')}
            />
            <Divider my="xs" />
            <MenuRow
              icon="solar:info-circle-linear"
              label="Help & support"
              onPress={() => router.push('/(app)/support' as never)}
            />
            <Divider my="xs" />
            <MenuRow
              icon="solar:document-linear"
              label="Legal & policies"
              onPress={() => router.push('/legal' as never)}
            />
          </Card>
        </View>

        {/* Account management */}
        <SectionHeader label="ACCOUNT" />
        <View style={{ paddingHorizontal: spacing.xl }}>
          <Card padded={false}>
            <MenuRow
              icon="solar:danger-triangle-bold"
              label="Delete account"
              onPress={() => router.push('/delete-account' as never)}
            />
          </Card>
        </View>

        {/* Sign out */}
        <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
          <Pressable
            onPress={() => setConfirmOut(true)}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
              height: 54, borderRadius: radii.lg,
              backgroundColor: pressed ? colors.negativeSubtle : 'transparent',
              borderWidth: 1.5, borderColor: colors.negativeSubtle,
            })}
          >
            <Icon name="solar:logout-3-linear" size={20} color={colors.negative} />
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.negative }}>Sign Out</Text>
          </Pressable>
        </View>

        <Text variant="small" tone="subtle" align="center" style={{ marginTop: spacing['3xl'] }}>
          ETICO — by Moneta Capital Investment Limited
        </Text>
        <Text variant="small" tone="subtle" align="center" style={{ marginTop: spacing.xs }}>
          v1.0.0
        </Text>
      </ScrollView>

      {/* Sign-out confirmation sheet */}
      <Modal visible={confirmOut} transparent animationType="fade" onRequestClose={() => setConfirmOut(false)}>
        <Pressable style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' }} onPress={() => setConfirmOut(false)}>
          <MotiView
            from={{ translateY: 40, opacity: 0 }}
            animate={{ translateY: 0, opacity: 1 }}
            transition={{ type: 'timing', duration: 240 }}
          >
            <Pressable
              onPress={() => {}}
              style={{
                backgroundColor: colors.surfaceRaised,
                borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
                paddingHorizontal: spacing.xl, paddingTop: spacing.lg,
                paddingBottom: Math.max(insets.bottom, spacing.xl),
              }}
            >
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.xl }} />
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.negativeSubtle, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>
                <Icon name="solar:logout-3-bold" size={26} color={colors.negative} />
              </View>
              <Text variant="h2" align="center" style={{ marginTop: spacing.lg }}>Sign out?</Text>
              <Text variant="body" tone="muted" align="center" style={{ marginTop: spacing.sm }}>
                You'll need your email and password to sign back in.
              </Text>
              <View style={{ marginTop: spacing['2xl'], gap: spacing.md }}>
                <Pressable
                  // AuthGate handles the redirect once signOut clears `user`.
                  // Awaiting ensures SecureStore + Supabase are cleared before any
                  // subsequent tap can race the local wipe.
                  onPress={async () => { setConfirmOut(false); await signOut() }}
                  style={({ pressed }) => ({
                    height: 54, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: pressed ? colors.negativeSubtle : colors.negative,
                  })}
                >
                  {({ pressed }) => (
                    <Text style={{ fontSize: 15, fontWeight: '800', color: pressed ? colors.negative : colors.textInverse }}>Yes, sign out</Text>
                  )}
                </Pressable>
                <Button title="Cancel" variant="secondary" onPress={() => setConfirmOut(false)} />
              </View>
            </Pressable>
          </MotiView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'], marginBottom: spacing.sm }}>
      <Text variant="eyebrow" tone="muted">{label}</Text>
    </View>
  )
}

function StatusRow({ icon, label, status }: { icon: string; label: string; status: string }) {
  const s = statusStyle(status)
  return (
    <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
      <Row justify="space-between" align="center">
        <Row gap="md" align="center" style={{ flex: 1 }}>
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.bgSubtle, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} size={18} color={colors.textMuted} />
          </View>
          <Text variant="bodyStrong">{label}</Text>
        </Row>
        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: s.bg }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: s.fg, letterSpacing: 0.4 }}>{s.label}</Text>
        </View>
      </Row>
    </View>
  )
}

function MenuRow({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: pressed ? colors.bgMuted : 'transparent' },
      ]}
    >
      <Row justify="space-between" align="center">
        <Row gap="md" align="center" style={{ flex: 1 }}>
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.bgSubtle, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} size={18} color={colors.textMuted} />
          </View>
          <Text variant="body">{label}</Text>
        </Row>
        <Icon name="solar:alt-arrow-right-linear" size={18} color={colors.textSubtle} />
      </Row>
    </Pressable>
  )
}

function statusStyle(status: string): { label: string; bg: string; fg: string } {
  switch (status) {
    case 'verified':
    case 'approved':
    case 'linked':
      return { label: status === 'linked' ? 'LINKED' : 'VERIFIED', bg: colors.positiveSubtle, fg: colors.positive }
    case 'rejected':
      return { label: 'REJECTED', bg: colors.negativeSubtle, fg: colors.negative }
    case 'pending':
    case 'submitted':
      return { label: status.toUpperCase(), bg: colors.warningSubtle, fg: colors.warning }
    case 'not_linked':
      return { label: 'NOT LINKED', bg: colors.bgSubtle, fg: colors.textMuted }
    default:
      return { label: status.toUpperCase().replace(/_/g, ' '), bg: colors.bgSubtle, fg: colors.textMuted }
  }
}

const avatarStyle = {
  width: 72,
  height: 72,
  borderRadius: 36,
  backgroundColor: colors.brand,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
}
