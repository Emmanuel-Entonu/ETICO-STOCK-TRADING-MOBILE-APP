import { useCallback, useState } from 'react'
import {
  View, ScrollView, Pressable, RefreshControl, StyleSheet, Image,
  useWindowDimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { useShallow } from 'zustand/react/shallow'
import { MotiView } from 'moti'
import { useAuthStore } from '@/store/authStore'
import { syncWalletFunding, getVaTransactions, type VaTransaction } from '@/lib/monetaApi'
import { supabase } from '@/lib/supabase'
import { Text, Row, Button, Icon, Loader, toast, Skeleton } from '@/ui'
import { colors, spacing, radii, useThemedStyles } from '@/theme'
import { naira } from '@/lib/format'

interface LedgerRow {
  id: number
  type: 'deposit' | 'funding' | 'reversal' | 'payout'
  amount: number
  balance_after: number
  created_at: string
}

const LEDGER_META: Record<LedgerRow['type'], { label: string; icon: string; positive: boolean }> = {
  deposit:  { label: 'Deposit received',   icon: 'solar:arrow-down-bold',        positive: true  },
  funding:  { label: 'Moved to wallet',    icon: 'solar:arrow-right-up-bold',    positive: false },
  reversal: { label: 'Funding reversed',   icon: 'solar:refresh-bold',           positive: true  },
  payout:   { label: 'Payout',             icon: 'solar:arrow-up-bold',          positive: false },
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ', ' +
      d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

export default function WalletScreen() {
  const router = useRouter()
  const styles = useThemedStyles(makeStyles)

  const { width: screenW } = useWindowDimensions()
  const cardW = screenW
  const cardH = cardW / 2.1

  const {
    kycStatus, cacsStatus, walletBalance, vaAvailable,
    vaNumber, vaBank, vaAccountName,
    ensureWallet, refreshWalletBalance, refreshVaAvailable,
  } = useAuthStore(useShallow(s => ({
    kycStatus: s.kycStatus, cacsStatus: s.cacsStatus, walletBalance: s.walletBalance, vaAvailable: s.vaAvailable,
    vaNumber: s.vaNumber, vaBank: s.vaBank, vaAccountName: s.vaAccountName,
    ensureWallet: s.ensureWallet, refreshWalletBalance: s.refreshWalletBalance,
    refreshVaAvailable: s.refreshVaAvailable,
  })))

  const [provisioning, setProvisioning] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [vaTx, setVaTx] = useState<VaTransaction[]>([])
  const [vaTxFailed, setVaTxFailed] = useState(false)
  const [activityTab, setActivityTab] = useState<'deposits' | 'moves'>('deposits')

  const kycDone = kycStatus === 'verified' || kycStatus === 'submitted'
  const hasWallet = !!vaNumber

  const loadLedger = useCallback(async () => {
    const { data } = await supabase
      .from('va_ledger')
      .select('id, type, amount, balance_after, created_at')
      // "Wallet moves" = money moved between the VA and the trading wallet.
      // Bank deposits have their own tab (Moneta VA history), so exclude the
      // ledger's 'deposit' rows here — they showed up twice.
      .in('type', ['funding', 'reversal', 'payout'])
      .order('created_at', { ascending: false })
      .limit(25)
    setLedger((data as LedgerRow[]) ?? [])
  }, [])

  // Real Moneta VA transaction history (bank credits/debits into the VA).
  // Best-effort — a failure here shouldn't blank the rest of the wallet.
  const loadVaTx = useCallback(async () => {
    try { setVaTx(await getVaTransactions()); setVaTxFailed(false) }
    catch (e) { setVaTxFailed(true); console.warn('[wallet] VA transactions load failed:', (e as Error).message) }
  }, [])

  // Pull everything fresh: detect new VA deposits (credits va_available), then
  // read va_available + the live PAC wallet balance + both activity feeds.
  // The deposit sync can take 20-45s while Moneta is slow, so it no longer
  // blocks the screen: everything loads at once, and va_available is re-read
  // again when the sync finishes (it may have credited a new deposit).
  const syncAll = useCallback(async () => {
    await Promise.all([
      refreshVaAvailable(), refreshWalletBalance(), loadLedger(), loadVaTx(),
      syncWalletFunding().then(() => refreshVaAvailable()),
    ])
  }, [refreshVaAvailable, refreshWalletBalance, loadLedger, loadVaTx])

  const provision = useCallback(async () => {
    if (!kycDone) return
    setError(null)
    setProvisioning(true)
    try {
      await ensureWallet()
      await syncAll()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setProvisioning(false)
    }
  }, [kycDone, ensureWallet, syncAll])

  // Runs on first focus AND every time the wallet regains focus — e.g. after the
  // fund-wallet page closes — so the balances + activity refresh on return.
  useFocusEffect(useCallback(() => {
    if (kycDone && !hasWallet) provision()
    else if (hasWallet) syncAll().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kycDone, hasWallet, provision, syncAll]))

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      if (hasWallet) await syncAll()
      else await provision()
    } catch { /* surfaced via error state / toast */ }
    finally { setRefreshing(false) }
  }, [hasWallet, syncAll, provision])

  const copy = async (label: string, value: string) => {
    await Clipboard.setStringAsync(value)
    toast.success('Copied', `${label} copied to clipboard`)
  }

  // Funding now lives on its own pop-up page (app/fund-wallet.tsx). It handles
  // the amount input, the wait-for-PAC, the success state + auto-return, and the
  // masked error. The wallet re-syncs on focus when that page closes.
  const openFund = () => {
    if (vaAvailable <= 0) {
      toast.info('Nothing to move', 'Deposit to your wallet first.')
      return
    }
    router.push('/fund-wallet' as never)
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
        {/* ── Trading wallet (live PAC balance = buying power) ── */}
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
              <Text style={styles.balanceEyebrow}>TRADING ACCOUNT</Text>
              <Text
                style={styles.balanceValue}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {naira(walletBalance)}
              </Text>
              <Row gap="sm" align="center" style={{ marginTop: spacing.xs }}>
                <Icon name="solar:wallet-money-bold" size={13} color="rgba(255,255,255,0.6)" />
                <Text style={styles.balanceSub}>Your buying power on the exchange</Text>
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
          <View style={[styles.infoCard, { alignItems: 'stretch', gap: spacing.md }]}>
            <Text variant="small" tone="muted">Setting up your wallet. This only takes a moment.</Text>
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Skeleton width={90} height={12} />
                <Skeleton width={i === 1 ? 130 : 110} height={14} />
              </View>
            ))}
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

        {hasWallet && (
          <>
            {/* ── Virtual account: money available to move into the wallet ──
                Shows va_available (reconciled deposits), NOT the raw Moneta VA
                balance: Providus sweeps the VA to ~0, so that figure is always
                empty and misleading. va_available is what the user can actually
                move to their trading wallet. */}
            <View style={styles.vaCard}>
              <Row align="center" justify="space-between">
                {/* flex:1 + minWidth:0 bound the width so iOS can shrink-to-fit
                    the amount; without it the text frame and glyphs disagreed
                    and the amount drew up over the label on iOS. */}
                <View style={{ flex: 1, minWidth: 0, marginRight: spacing.md }}>
                  <Text variant="eyebrow" tone="muted">WALLET</Text>
                  <Text style={styles.vaBalance} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                    {naira(vaAvailable)}
                  </Text>
                </View>
                <Icon name="solar:card-transfer-bold" size={28} color={colors.brand} />
              </Row>
              <Text variant="small" tone="muted" style={{ marginTop: spacing.xs }}>
                Money in your wallet, available to move into your trading account.
              </Text>
              <View style={{ height: spacing.lg }} />
              <Button
                title="Fund trading account"
                onPress={openFund}
                // Money only moves to the trading account once PAC has approved
                // the CSCS (server enforces it too); until then it stays here.
                disabled={vaAvailable <= 0 || cacsStatus !== 'approved'}
              />
              {cacsStatus !== 'approved' ? (
                <Text variant="small" tone="muted" align="center" style={{ marginTop: spacing.sm }}>
                  You can move money to your trading account once your account is verified. Until then it stays safe in your wallet.
                </Text>
              ) : null}
            </View>

            {/* ── Deposit details ── */}
            <Text variant="eyebrow" tone="muted" style={{ marginTop: spacing['2xl'], marginBottom: spacing.md }}>
              ADD MONEY
            </Text>
            <Text variant="small" tone="muted" style={{ marginBottom: spacing.lg }}>
              Transfer to this dedicated account from any bank. It shows up in your wallet, then you move what you want into your trading account.
            </Text>

            <View style={styles.detailCard}>
              <DetailRow label="Bank" value={vaBank ?? '-'} />
              <View style={styles.detailDivider} />
              <DetailRow
                label="Account number"
                value={vaNumber ?? '-'}
                onCopy={vaNumber ? () => copy('Account number', vaNumber) : undefined}
                emphasize
              />
              <View style={styles.detailDivider} />
              <DetailRow label="Account name" value={vaAccountName ?? '-'} />
            </View>

            {/* ── Activity ── two feeds: real VA deposits, and wallet moves. */}
            <Text variant="eyebrow" tone="muted" style={{ marginTop: spacing['2xl'], marginBottom: spacing.md }}>
              ACTIVITY
            </Text>
            <View style={styles.segment}>
              <SegmentTab label="Deposits" active={activityTab === 'deposits'} onPress={() => setActivityTab('deposits')} />
              <SegmentTab label="Wallet moves" active={activityTab === 'moves'} onPress={() => setActivityTab('moves')} />
            </View>
            <View style={{ height: spacing.md }} />

            {activityTab === 'deposits' ? (
              vaTx.length === 0 ? (
                <View style={styles.emptyLedger}>
                  <Icon name="solar:clock-circle-linear" size={22} color={colors.textMuted} />
                  <Text variant="small" tone="muted" style={{ marginTop: spacing.sm }}>{vaTxFailed ? "Couldn't load deposits" : 'No deposits yet'}</Text>
                  <Text variant="small" tone="subtle" align="center" style={{ marginTop: spacing.xs, paddingHorizontal: spacing.lg }}>
                    {vaTxFailed ? 'Pull down to try again. Your money is safe.' : 'Transfers into your wallet show up here.'}
                  </Text>
                </View>
              ) : (
                <View style={styles.detailCard}>
                  {vaTx.map((t, i) => {
                    const credit = t.type === 'credit'
                    return (
                      <View key={t.id}>
                        {i > 0 && <View style={styles.detailDivider} />}
                        <Row align="center" gap="md" style={{ paddingVertical: spacing.md, paddingHorizontal: spacing.lg }}>
                          <View style={styles.ledgerIcon}>
                            <Icon
                              name={credit ? 'solar:arrow-down-bold' : 'solar:arrow-up-bold'}
                              size={16}
                              color={credit ? colors.positive : colors.text}
                            />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text variant="bodyStrong" numberOfLines={1}>{credit ? 'Deposit received' : (t.party || 'Debit')}</Text>
                            <Text variant="small" tone="muted">
                              {fmtDate(new Date(t.ts).toISOString())}
                              {t.fee > 0 ? ` · fee ${naira(t.fee)}` : ''}
                              {t.status === 'failed' ? ' · failed' : ''}
                            </Text>
                          </View>
                          <Text variant="bodyStrong" style={{ color: credit ? colors.positive : colors.text }}>
                            {credit ? '+' : '−'}{naira(Math.abs(t.amount))}
                          </Text>
                        </Row>
                      </View>
                    )
                  })}
                </View>
              )
            ) : (
              ledger.length === 0 ? (
                <View style={styles.emptyLedger}>
                  <Icon name="solar:clock-circle-linear" size={22} color={colors.textMuted} />
                  <Text variant="small" tone="muted" style={{ marginTop: spacing.sm }}>No wallet moves yet</Text>
                </View>
              ) : (
                <View style={styles.detailCard}>
                  {ledger.map((row, i) => {
                    const meta = LEDGER_META[row.type] ?? LEDGER_META.deposit
                    return (
                      <View key={row.id}>
                        {i > 0 && <View style={styles.detailDivider} />}
                        <Row align="center" gap="md" style={{ paddingVertical: spacing.md, paddingHorizontal: spacing.lg }}>
                          <View style={styles.ledgerIcon}>
                            <Icon name={meta.icon} size={16} color={meta.positive ? colors.positive : colors.text} />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text variant="bodyStrong" numberOfLines={1}>{meta.label}</Text>
                            <Text variant="small" tone="muted">{fmtDate(row.created_at)}</Text>
                          </View>
                          <Text
                            variant="bodyStrong"
                            style={{ color: meta.positive ? colors.positive : colors.text }}
                          >
                            {meta.positive ? '+' : '−'}{naira(Math.abs(Number(row.amount)))}
                          </Text>
                        </Row>
                      </View>
                    )
                  })}
                </View>
              )
            )}

            <View style={{ height: spacing['2xl'] }} />

            {/* Withdraw — payouts to settlement account (coming soon) */}
            <Button
              title="Withdraw"
              variant="secondary"
              onPress={() => toast.info('Withdraw', 'Payouts to your settlement account are coming soon.')}
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

function SegmentTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[segmentTabStyle, active && { backgroundColor: colors.brand }]}>
      <Text variant="smallStrong" style={{ color: active ? colors.textOnBrand : colors.textMuted }}>{label}</Text>
    </Pressable>
  )
}

const segmentTabStyle = {
  flex: 1,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  paddingVertical: spacing.sm,
  borderRadius: radii.pill,
  backgroundColor: 'transparent' as const,
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
  cardWrap: {
    alignSelf: 'center',
    marginHorizontal: -spacing.xl,
    overflow: 'hidden',
  },
  cardContent: {
    ...StyleSheet.absoluteFill,
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
    lineHeight: 40,
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
  vaCard: {
    marginTop: spacing['2xl'],
    padding: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  vaBalance: {
    fontSize: 28,
    lineHeight: 36,          // explicit, like balanceValue, required for iOS shrink-to-fit
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -0.5,
    marginTop: 4,
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
  ledgerIcon: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bgSubtle,
  },
  emptyLedger: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  segment: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.bgSubtle,
  },
})
