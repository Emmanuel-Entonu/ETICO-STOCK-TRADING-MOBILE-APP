import { useCallback, useState } from 'react'
import { View, ScrollView, Pressable, Modal, Linking } from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { setStatusBarStyle } from 'expo-status-bar'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { MotiView } from 'moti'
import { useAuthStore } from '@/store/authStore'
import { Text, Button, Icon, toast } from '@/ui'
import { colors, spacing, radii, useThemeStore, resolveScheme } from '@/theme'
import { useNotificationStore } from '@/store/notificationStore'
import AeroShards from '@/components/AeroShards'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar'
import { useShallow } from 'zustand/react/shallow'

export default function AccountScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user, signOut, kycStatus, cacsStatus, pacAccountId, cscsNumber } = useAuthStore(useShallow((s) => ({ user: s.user, signOut: s.signOut, kycStatus: s.kycStatus, cacsStatus: s.cacsStatus, pacAccountId: s.pacAccountId, cscsNumber: s.cscsNumber })))
  const [confirmOut, setConfirmOut] = useState(false)

  const email = user?.email ?? '-'

  // Statuses only turn green once PAC has approved the account on the partner
  // dashboard (cacs_status = approved). Until then KYC reads "Under review" and
  // CSCS / brokerage read "Pending". Approved → Verified / Linked / Linked.
  const approved = cacsStatus === 'approved'
  const rejected = cacsStatus === 'rejected'
  const submitted = kycStatus === 'verified' || kycStatus === 'submitted'
  const kycLine: StatusLine =
    approved ? { label: 'Verified', tone: 'positive' }
    : rejected ? { label: 'Rejected', tone: 'negative' }
    : submitted ? { label: 'Under review', tone: 'warning' }
    : { label: 'Not started', tone: 'muted' }
  const cscsLine: StatusLine =
    approved ? { label: 'Linked', tone: 'positive' }
    : rejected ? { label: 'Rejected', tone: 'negative' }
    : { label: 'Pending', tone: 'warning' }
  const brokerageLine: StatusLine =
    approved && pacAccountId ? { label: 'Linked', tone: 'positive' }
    : { label: 'Pending', tone: 'warning' }

  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? ''
  const firstName = fullName.split(' ')[0] || user?.email?.split('@')[0] || '?'
  const displayName = fullName || firstName
  const initial = (firstName[0] ?? '?').toUpperCase()

  // Light status-bar text over the black header while this tab is visible;
  // restore the theme's style when leaving (tabs stay mounted).
  const mode = useThemeStore((st) => st.mode)
  // Tabs stay mounted: animate the header rays only while Account is visible.
  const [focused, setFocused] = useState(true)
  // Stop the header animation once it's scrolled out of view (only flips
  // state when crossing the threshold, so scrolling doesn't re-render).
  const [headerVisible, setHeaderVisible] = useState(true)
  useFocusEffect(useCallback(() => {
    setFocused(true)
    setStatusBarStyle('light')
    return () => {
      setFocused(false)
      setStatusBarStyle(resolveScheme(mode) === 'dark' ? 'light' : 'dark')
    }
  }, [mode]))

  const unread = useNotificationStore((st) => st.unread())

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: HEADER_BG }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={100}
        onScroll={(e) => {
          const visible = e.nativeEvent.contentOffset.y < 260
          if (visible !== headerVisible) setHeaderVisible(visible)
        }}
      >

        {/* ── Header (black). Animation slot: render the background animation
            as the FIRST child of this View with StyleSheet.absoluteFill, the
            content below sits on top of it. ── */}
        <View style={{ backgroundColor: HEADER_BG, paddingBottom: spacing['2xl'], overflow: 'hidden' }}>
          {/* Emerald + gold shard stream behind the header content (React Bits
              AeroShards, ported to Skia). ErrorBoundary: if the GPU draw fails
              on some device the header just stays black. */}
          <ErrorBoundary retry>
            <AeroShards
              shardColor="#10B981"
              accentColor="#EAB308"
              density={1.5}
              shardSize={1.1}
              speed={0.55}
              spin={0.5}
              fps={30}
              spread={1}
              depth={1}
              stretch={1}
              glow={1}
              paused={!focused || !headerVisible}
            />
          </ErrorBoundary>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingTop: spacing.md, height: 56 }}>
            <View style={{ width: 40 }} />
            <Text style={{ color: '#FFFFFF', fontSize: 17, lineHeight: 22, fontWeight: '700' }}>Account</Text>
            <Pressable
              onPress={() => router.push('/notifications' as never)}
              hitSlop={10}
              accessibilityLabel="Notifications"
              style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.10)' })}
            >
              <Icon name="solar:bell-linear" size={20} color="#FFFFFF" />
              {unread > 0 ? <View style={{ position: 'absolute', top: 9, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.negative, borderWidth: 1.5, borderColor: HEADER_BG }} /> : null}
            </Pressable>
          </View>

          <MotiView
            from={{ opacity: 0, translateY: 8 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 340 }}
            style={{ alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.lg }}
          >
            <View style={avatarStyle}>
              <Text style={{ color: colors.textOnBrand, fontSize: 30, lineHeight: 36, fontWeight: '800', textAlign: 'center', textAlignVertical: 'center', includeFontPadding: false }}>{initial}</Text>
            </View>
            <Text style={{ color: '#FFFFFF', fontSize: 20, lineHeight: 26, fontWeight: '800', marginTop: spacing.md }} numberOfLines={1}>{displayName}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 18, marginTop: 2 }} numberOfLines={1}>{email}</Text>
          </MotiView>
        </View>

        {/* ── Sheet: our colour scheme, rounded top, grouped rows. The big
            bottom padding + matching negative margin keeps the sheet colour
            under an iOS over-scroll instead of revealing the black header. ── */}
        <View style={sheetStyle()}>
          {/* Verification */}
          <Group label="Verification">
            <ListRow icon="solar:shield-check-linear" label="KYC identity" status={kycLine} />
            <ListRow icon="solar:document-text-linear" label="NGX / CSCS" status={cscsLine} />
            {approved && cscsNumber ? (
              <ListRow icon="solar:hashtag-linear" label="CSCS number" value={cscsNumber} />
            ) : null}
            <ListRow icon="solar:card-2-linear" label="Brokerage account" status={brokerageLine} last />
          </Group>

          {/* Preferences */}
          <Group label="Preferences">
            <ListRow
              icon="solar:bell-linear"
              label="Notifications"
              // Per-app notification switches live in the OS settings for ETICO.
              onPress={() => { Linking.openSettings().catch(() => toast.error('Could not open settings', 'Open your phone Settings → Apps → ETICO → Notifications.')) }}
            />
            <ListRow
              icon="solar:lock-password-linear"
              label="Change password"
              onPress={() => router.push({ pathname: '/(auth)/reset', params: user?.email ? { email: user.email } : {} } as never)}
            />
            <ListRow icon="solar:info-circle-linear" label="Help & support" onPress={() => router.push('/(app)/support' as never)} />
            <ListRow icon="solar:document-linear" label="Legal & policies" onPress={() => router.push('/legal' as never)} last />
          </Group>

          {/* Account */}
          <Group label="Account">
            <ListRow icon="solar:trash-bin-minimalistic-linear" label="Delete account" onPress={() => router.push('/delete-account' as never)} last />
          </Group>

          {/* Sign out */}
          <Group>
            <ListRow icon="solar:logout-3-linear" label="Sign out" danger onPress={() => setConfirmOut(true)} last />
          </Group>

          <Text variant="small" tone="subtle" align="center" style={{ marginTop: spacing['2xl'] }}>
            ETICO by Moneta Capital Investment Limited
          </Text>
          <Text variant="small" tone="subtle" align="center" style={{ marginTop: spacing.xs }}>
            v1.0.0
          </Text>
        </View>
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

type Tone = 'positive' | 'warning' | 'negative' | 'muted'
type StatusLine = { label: string; tone: Tone }

const toneColor = (t: Tone) =>
  t === 'positive' ? colors.positive : t === 'warning' ? colors.warning : t === 'negative' ? colors.negative : colors.textMuted

// A titled, rounded group of rows (settings-list style).
function Group({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl }}>
      {label ? <Text variant="small" tone="muted" style={{ marginBottom: spacing.sm, marginLeft: spacing.xs }}>{label}</Text> : null}
      <View style={{ borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
        {children}
      </View>
    </View>
  )
}

// One row: icon · label · (status text | value | chevron). Status is plain
// coloured text — no pill.
function ListRow({ icon, label, status, value, onPress, danger, last }: {
  icon: string; label: string; status?: StatusLine; value?: string
  onPress?: () => void; danger?: boolean; last?: boolean
}) {
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: spacing.lg }}>
      <Icon name={icon} size={20} color={danger ? colors.negative : colors.textMuted} />
      <View style={{
        flex: 1, flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: spacing.sm,
        marginLeft: spacing.md, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border,
      }}>
        <Text variant="body" style={{ flex: 1, color: danger ? colors.negative : colors.text }}>{label}</Text>
        {status ? <Text variant="smallStrong" style={{ color: toneColor(status.tone) }}>{status.label}</Text> : null}
        {value ? <Text variant="smallStrong" tone="muted" selectable>{value}</Text> : null}
        {onPress && !danger ? <Icon name="solar:alt-arrow-right-linear" size={18} color={colors.textSubtle} /> : null}
      </View>
    </View>
  )
  if (!onPress) return content
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ backgroundColor: pressed ? colors.bgMuted : 'transparent' })}>
      {content}
    </Pressable>
  )
}

// Black header behind the avatar — placeholder until the animation lands.
const HEADER_BG = '#000000'
const OVERSCROLL_PAD = 600

// Function (not a module-level object) so the colors proxy is read per render
// and dark mode stays correct.
const sheetStyle = () => ({
  flexGrow: 1,
  backgroundColor: colors.bg,
  borderTopLeftRadius: 28,
  borderTopRightRadius: 28,
  paddingTop: spacing.sm,
  paddingBottom: TAB_BAR_CLEARANCE + spacing.lg + OVERSCROLL_PAD,
  marginBottom: -OVERSCROLL_PAD,
})

const avatarStyle = {
  width: 84,
  height: 84,
  borderRadius: 42,
  borderWidth: 3,
  borderColor: 'rgba(255,255,255,0.14)',
  backgroundColor: colors.brand,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
}
