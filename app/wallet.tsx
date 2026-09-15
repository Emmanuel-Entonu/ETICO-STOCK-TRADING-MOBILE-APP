import { useCallback, useEffect, useState } from 'react'
import { View, ScrollView, Pressable, RefreshControl, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { useShallow } from 'zustand/react/shallow'
import { LinearGradient } from 'expo-linear-gradient'
import { MotiView } from 'moti'
import { useAuthStore } from '@/store/authStore'
import { syncWalletFunding } from '@/lib/monetaApi'
import { Text, Row, Stack, Button, Icon, Loader, toast } from '@/ui'
import { colors, spacing, radii, useThemedStyles } from '@/theme'
import { naira } from '@/lib/format'

export default function WalletScreen() {
  const router = useRouter()
  const styles = useThemedStyles(makeStyles)

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
        {/* ── Balance card ── */}
        <MotiView
          from={{ opacity: 0, translateY: 10 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 300 }}
          style={styles.balanceCard}
        >
          <LinearGradient
            colors={['#1A1D10', '#0F100B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={{ padding: spacing.xl }}>
            <Text style={styles.balanceEyebrow}>WALLET BALANCE</Text>
            <Text style={styles.balanceValue}>{naira(walletBalance)}</Text>
            <Row gap="sm" align="center" style={{ marginTop: spacing.sm }}>
              <Icon name="solar:shield-check-bold" size={14} color="rgba(255,255,255,0.6)" />
              <Text style={styles.balanceSub}>Funds you add are tracked here</Text>
            </Row>
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
  balanceCard: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    minHeight: 150,
    backgroundColor: '#0F100B',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  },
  balanceEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 1.4,
  },
  balanceValue: {
    fontSize: 38,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -1.2,
    marginTop: spacing.sm,
    lineHeight: 44,
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
