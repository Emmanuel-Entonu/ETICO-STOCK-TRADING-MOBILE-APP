import { useCallback, useEffect, useState } from 'react'
import { View, ScrollView, Pressable, RefreshControl, StyleSheet, Image, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { useShallow } from 'zustand/react/shallow'
import { MotiView } from 'moti'
import { useAuthStore } from '@/store/authStore'
import { syncWalletFunding } from '@/lib/monetaApi'
import { Text, Row, Stack, Button, Icon, Loader, toast } from '@/ui'
import { colors, spacing, radii, useThemedStyles } from '@/theme'
import { naira } from '@/lib/format'

export default function WalletScreen() {
  const router = useRouter()
  const styles = useThemedStyles(makeStyles)

  // Explicit card size from the screen width. The card bleeds nearly full-width
  // (a bit wider than the padded text below) for presence; height follows the
  // wallet PNG's 2.3 ratio. Driving size directly is more reliable than aspectRatio.
  const { width: screenW } = useWindowDimensions()
  const cardW = screenW
  // Taller than the PNG's native 2.3 ratio for more vertical presence (the image
  // uses resizeMode="stretch", so the extra height fills instead of letterboxing).
  const cardH = cardW / 2.1

  const {
    kycStatus, walletBalance,
    vaReference, vaNumber, vaBank, vaAccountName,
    ensureWallet, refreshWalletBalance,
  } = useAuthStore(useShallow(s => ({
    kycStatus: s.kycStatus, walletBalance: s.walletBalance,
    vaReference: s.vaReference, vaNumber: s.vaNumber, vaBank: s.vaBank, vaAccountName: s.vaAccountName,
    ensureWallet: s.ensureWallet, refreshWalletBalance: s.refreshWalletBalance,
  })))

  const [provisioning, setProvisioning] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const kycDone = kycStatus === 'verified' || kycStatus === 'submitted'
  const hasWallet = !!vaNumber

  // On open: create the VA if the user doesn't have one yet, then pull balance.
  const provision = useCallback(async () => {
    if (!kycDone) return
    setError(null)
    setProvisioning(true)
    try {
      await ensureWallet()
      await syncWalletFunding()          // pull any new VA deposit into the wallet now
      await refreshWalletBalance()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setProvisioning(false)
    }
  }, [kycDone, ensureWallet, refreshWalletBalance])

  useEffect(() => {
    if (kycDone && !hasWallet) provision()
    else if (hasWallet) syncWalletFunding().then(refreshWalletBalance).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      if (hasWallet) { await syncWalletFunding(); await refreshWalletBalance() }
      else await provision()
    } catch { /* surfaced via error state / toast */ }
    finally { setRefreshing(false) }
  }, [hasWallet, refreshWalletBalance, provision])

  const copy = async (label: string, value: string) => {
    await Clipboard.setStringAsync(value)
    toast.success('Copied', `${label} copied to clipboard`)
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <Row gap="md" align="center" style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Icon name="solar:alt-arrow-left-linear" size={20} color={colors.text} />
        </Pressable>
        <Text variant="h2">Wallet</Text>
      </Row>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing['3xl'] }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {/* ── Balance card — leather wallet graphic with content overlaid on the
             left face (kept clear of the gold snap on the right). The card
             scales with screen width via aspectRatio, so it's responsive. ── */}
        <MotiView
          from={{ opacity: 0, translateY: 10 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 300 }}
          style={[styles.cardWrap, { width: cardW, height: cardH }]}
        >
          <Image
            source={require('../assets/brand/wallet-card.png')}
            style={{ width: cardW, height: cardH }}
            resizeMode="stretch"
          />
          <View style={styles.cardContent}>
            <View>
              <Text style={styles.balanceEyebrow}>WALLET BALANCE</Text>
              <Text
                style={styles.balanceValue}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {naira(walletBalance)}
              </Text>
              <Row gap="sm" align="center" style={{ marginTop: spacing.xs }}>
                <Icon name="solar:shield-check-bold" size={13} color="rgba(255,255,255,0.6)" />
                <Text style={styles.balanceSub}>Funds you add are tracked here</Text>
              </Row>
            </View>
          </View>
        </MotiView>

        {/* ── Not KYC-verified yet ── */}
        {!kycDone && (
          <View style={styles.infoCard}>
            <Icon name="solar:shield-user-bold" size={26} color={colors.brand} />
            <Text variant="bodyStrong" style={{ marginTop: spacing.md }}>Finish verification first</Text>
            <Text variant="small" tone="muted" align="center" style={{ marginTop: spacing.xs }}>
              Complete your KYC to open your wallet and get a funding account.
            </Text>
            <View style={{ height: spacing.lg }} />
            <Button title="Verify identity" size="sm" fullWidth={false} onPress={() => router.push('/(auth)/kyc' as never)} />
          </View>
        )}

        {/* ── Provisioning ── */}
        {kycDone && !hasWallet && provisioning && (
          <View style={styles.infoCard}>
            <Loader size={48} />
            <Text variant="bodyStrong" style={{ marginTop: spacing.md }}>Setting up your wallet…</Text>
            <Text variant="small" tone="muted" align="center" style={{ marginTop: spacing.xs }}>
              This only takes a moment.
            </Text>
          </View>
        )}

        {/* ── Provisioning failed ── */}
        {kycDone && !hasWallet && !provisioning && (
          <View style={styles.infoCard}>
            <Icon name="solar:danger-triangle-bold" size={26} color={colors.negative} />
            <Text variant="bodyStrong" style={{ marginTop: spacing.md }}>Could not open your wallet</Text>
            {error && (
              <Text variant="small" tone="muted" align="center" style={{ marginTop: spacing.xs }}>{error}</Text>
            )}
            <View style={{ height: spacing.lg }} />
            <Button title="Try again" size="sm" fullWidth={false} onPress={provision} />
          </View>
        )}

        {/* ── Virtual account details ── */}
        {hasWallet && (
          <>
            <Text variant="eyebrow" tone="muted" style={{ marginTop: spacing['2xl'], marginBottom: spacing.md }}>
              FUND YOUR WALLET
            </Text>
            <Text variant="small" tone="muted" style={{ marginBottom: spacing.lg }}>
              Transfer to this dedicated account from any bank. Your wallet is credited automatically.
            </Text>

            <View style={styles.detailCard}>
              <DetailRow label="Bank" value={vaBank ?? '—'} />
              <View style={styles.detailDivider} />
              <DetailRow
                label="Account number"
                value={vaNumber ?? '—'}
                onCopy={vaNumber ? () => copy('Account number', vaNumber) : undefined}
                emphasize
              />
              <View style={styles.detailDivider} />
              <DetailRow label="Account name" value={vaAccountName ?? '—'} />
            </View>

            <View style={{ height: spacing['2xl'] }} />

            {/* Withdraw — intentionally does nothing yet */}
            <Button
              title="Withdraw"
              variant="secondary"
              onPress={() => toast.info('Withdraw', 'Withdrawals will be available soon.')}
            />
            <Text variant="small" tone="subtle" align="center" style={{ marginTop: spacing.md }}>
              Withdrawals are coming soon.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function DetailRow({ label, value, onCopy, emphasize }: {
  label: string
  value: string
  onCopy?: () => void
  emphasize?: boolean
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.lg, paddingHorizontal: spacing.lg }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="small" tone="muted">{label}</Text>
        <Text
          variant={emphasize ? 'h3' : 'bodyStrong'}
          style={{ marginTop: 2, letterSpacing: emphasize ? 1 : 0 }}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
      {onCopy && (
        <Pressable onPress={onCopy} hitSlop={10} style={({ pressed }) => [copyBtn, pressed && { opacity: 0.7 }]}>
          <Icon name="solar:copy-linear" size={16} color={colors.brand} />
          <Text variant="smallStrong" tone="brand">Copy</Text>
        </Pressable>
      )}
    </View>
  )
}

const copyBtn = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 6,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  borderRadius: radii.pill,
  backgroundColor: colors.brandSubtle,
}

const makeStyles = () => StyleSheet.create({
  backBtn: {
    width: 40, height: 40, borderRadius: radii.pill,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bgSubtle,
  },
  // Size is set inline from the screen width (see component). Negative side
  // margins let it bleed past the ScrollView's spacing.xl padding so the card
  // sits wider than the text below. overflow:hidden clips any stray overscale.
  cardWrap: {
    alignSelf: 'center',
    marginHorizontal: -spacing.xl,   // full-bleed past the ScrollView padding
    overflow: 'hidden',
  },
  // Overlay sits on the flat left leather face: kept clear of the gold snap on
  // the right (paddingRight) and the peeking card up top (paddingTop). Percentage
  // insets keep the layout correct as the card scales.
  cardContent: {
    ...StyleSheet.absoluteFillObject,
    paddingLeft: '7%',
    paddingRight: '24%',
    paddingTop: '11%',
    paddingBottom: '11%',
    justifyContent: 'center',
  },
  balanceEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 1.4,
  },
  balanceValue: {
    fontSize: 30,
    lineHeight: 40,        // explicit line height — without it Android clips the tall glyphs
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  balanceSub: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  infoCard: {
    marginTop: spacing['2xl'],
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  detailCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  detailDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
  },
})
