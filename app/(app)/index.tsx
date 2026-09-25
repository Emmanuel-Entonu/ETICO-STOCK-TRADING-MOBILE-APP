import { memo, useEffect, useState, useCallback, useMemo } from 'react'
import { View, ScrollView, Pressable, RefreshControl, StyleSheet } from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useShallow } from 'zustand/react/shallow'
import { usePortfolioStore } from '@/store/portfolioStore'
import { useAuthStore } from '@/store/authStore'
import { Text, Row, Stack, Card, Button, Divider, Icon, toast } from '@/ui'
import { colors, spacing, radii, useThemedStyles } from '@/theme'
import { naira, pct } from '@/lib/format'
import type { PacOrderListItem } from '@/lib/pacApi'
import { StockLogo } from '@/components/StockLogo'
import { LineChart } from 'react-native-gifted-charts'
import { LinearGradient } from 'expo-linear-gradient'
import { MotiView } from 'moti'
import Beams from '@/components/Beams'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar'
import { OrderRow } from '@/components/OrderRow'
import { RecommendedRail } from '@/components/RecommendedRail'
import { CscsNotice } from '@/components/CscsNotice'
import { useNotificationStore } from '@/store/notificationStore'

type Tab = 'holdings' | 'orders'

export default function HomeScreen() {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  // Only animate the Beams shader while Home is the visible screen — tabs stay
  // mounted, so it would otherwise render behind every other tab / modal.
  const [focused, setFocused] = useState(true)
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false) }, []))
  // Shallow selector — prevents Home from re-rendering on unrelated store
  // updates (e.g. marketData refresh) which was chewing frames on the
  // Beams three.js canvas.
  const { positions, loadingPortfolio, loadPositions, pacOrders, loadingOrders, loadOrders, cancelOrder, apiStatus } = usePortfolioStore(
    useShallow(s => ({
      positions: s.positions,
      loadingPortfolio: s.loadingPortfolio, loadPositions: s.loadPositions,
      pacOrders: s.pacOrders, loadingOrders: s.loadingOrders, loadOrders: s.loadOrders,
      cancelOrder: s.cancelOrder, apiStatus: s.apiStatus,
    }))
  )
  const { user, pacAccountId, kycStatus, cacsStatus, cacsRejectionReason, walletBalance } = useAuthStore(
    useShallow(s => ({
      user: s.user, pacAccountId: s.pacAccountId,
      kycStatus: s.kycStatus, cacsStatus: s.cacsStatus, cacsRejectionReason: s.cacsRejectionReason,
      walletBalance: s.walletBalance,
    }))
  )
  const [tab, setTab] = useState<Tab>('holdings')
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [showAllHoldings, setShowAllHoldings] = useState(false)
  const [hideWealth, setHideWealth] = useState(false)
  const unreadCount = useNotificationStore(s => s.items.filter(n => !n.read).length)
  const syncNotifs = useNotificationStore(s => s.sync)

  useEffect(() => { if (pacAccountId) loadPositions(pacAccountId) }, [pacAccountId])
  useEffect(() => { if (tab === 'orders' && pacAccountId) loadOrders(pacAccountId) }, [tab, pacAccountId])
  useEffect(() => { syncNotifs(pacOrders, { kycStatus, cacsStatus, cacsRejectionReason }) }, [pacOrders, kycStatus, cacsStatus, cacsRejectionReason, syncNotifs])

  // First filled BUY date per stock, for "Since …" on holdings (PAC positions
  // don't carry a purchase date). listOrders returns the latest 100, so with a
  // full page older buys may be missing — show nothing rather than a wrong date.
  const firstBuyDate = useMemo(() => {
    const out: Record<string, string> = {}
    if (pacOrders.length >= 100) return out
    const earliest: Record<string, number> = {}
    for (const o of pacOrders) {
      if (o.side !== 'BUY' || !(o.filledQty > 0 || o.orderStatus === 'FILLED')) continue
      const t = Date.parse(o.createdAt)
      if (!Number.isFinite(t)) continue
      const k = o.secId.toUpperCase()
      if (earliest[k] === undefined || t < earliest[k]) earliest[k] = t
    }
    for (const [k, t] of Object.entries(earliest)) {
      out[k] = new Date(t).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
    }
    return out
  }, [pacOrders])

  const totalMarketValue = positions.reduce((s, p) => s + p.marketValue, 0)
  const totalCost = positions.reduce((s, p) => s + p.averageCost * p.quantity, 0)
  const totalPnL  = positions.reduce((s, p) => s + p.unrealizedPnL, 0)
  const pnlPct    = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0
  const isUp = totalPnL >= 0
  const cashBalance = walletBalance
  const netWorth = totalMarketValue + cashBalance

  const firstName = (user?.user_metadata?.full_name as string | undefined)?.split(' ')[0]
    ?? user?.email?.split('@')[0]
    ?? 'there'
  const initial = firstName[0]?.toUpperCase() ?? '?'

  const refresh = useCallback(() => {
    if (pacAccountId) loadPositions(pacAccountId)
    if (tab === 'orders' && pacAccountId) loadOrders(pacAccountId)
  }, [pacAccountId, tab])

  const refreshing = loadingPortfolio || (tab === 'orders' && loadingOrders)

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE + spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />}
      >
        {/* Greeting header */}
        <Row justify="space-between" align="center" style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg }}>
          <Row gap="md" align="center">
            <View style={styles.avatar}>
              <Text style={{ color: colors.textOnBrand, fontWeight: '800', fontSize: 16, lineHeight: 20, textAlign: 'center', textAlignVertical: 'center', includeFontPadding: false }}>{initial}</Text>
            </View>
            <View>
              <Text variant="small" tone="muted">Welcome back</Text>
              <Text variant="bodyStrong" numberOfLines={1} style={{ maxWidth: 200 }}>{firstName}</Text>
            </View>
          </Row>
          <Pressable
            onPress={() => router.push('/notifications' as never)}
            hitSlop={12}
            style={styles.iconButton}
          >
            <Icon name="solar:bell-linear" size={20} color={colors.textMuted} />
            {unreadCount > 0 && (
              <View style={{
                position: 'absolute', top: 6, right: 6, minWidth: 8, height: 8,
                borderRadius: 4, backgroundColor: colors.accent,
              }} />
            )}
          </Pressable>
        </Row>

        {/* SECTION 1 — Wealth hero. Single job: total + delta. */}
        <View style={{ paddingHorizontal: spacing.xl }}>
          <MotiView
            from={{ opacity: 0, scale: 0.94, translateY: 8 }}
            animate={{ opacity: 1, scale: 1, translateY: 0 }}
            transition={{ type: 'spring', damping: 16, stiffness: 180, mass: 0.9 }}
            style={styles.wealthCard}
          >
            {/* Animated Beams (three.js). Gold directional light makes the beams
                glow gold; a green ambient washes the valleys so the brand green
                stays present on the near-black card. Wrapped in an ErrorBoundary
                so a shader failure on a weak GPU falls back to a gold→green
                gradient instead of crashing Home. */}
            <ErrorBoundary
              fallback={
                <LinearGradient
                  colors={['#DAA92F', '#3A4429', '#0D0E0B']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              }
            >
              <Beams
                paused={!focused}
                beamWidth={2}
                beamHeight={15}
                beamNumber={12}
                lightColor="#E8BE45"        // gold — the beams glow gold
                beamColor="#0D0E0B"         // near-black beam base
                backgroundColor="#0B0C08"   // near-black canvas
                ambientColor="#4C5A38"      // brand green wash in the valleys
                ambientIntensity={0.9}
                speed={2.6}
                noiseIntensity={1.4}
                scale={0.2}
                rotation={30}
              />
            </ErrorBoundary>
            {/* Bottom vignette — keeps the numbers readable over the lit patches. */}
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.62)']}
              locations={[0.35, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={{ padding: spacing.xl }}>
              <Row justify="space-between" align="center">
                <Text style={styles.wealthEyebrow}>TOTAL WEALTH</Text>
                <Pressable
                  onPress={() => setHideWealth(v => !v)}
                  hitSlop={12}
                  style={styles.wealthEye}
                >
                  <Icon
                    name={hideWealth ? 'solar:eye-closed-linear' : 'solar:eye-linear'}
                    size={18}
                    color="rgba(255,255,255,0.85)"
                  />
                </Pressable>
              </Row>
              <Text style={styles.wealthValue}>{hideWealth ? '₦ • • • • • •' : naira(netWorth)}</Text>
              <Row gap="sm" style={{ marginTop: spacing.md }}>
                <View style={styles.wealthPill}>
                  <Icon name={isUp ? 'solar:arrow-up-bold' : 'solar:arrow-down-bold'} size={12} color="#FFFFFF" />
                  <Text style={styles.wealthPillText}>
                    {hideWealth ? '••••' : `${isUp ? '+' : ''}${naira(Math.abs(totalPnL))}`}
                  </Text>
                </View>
                <View style={styles.wealthPill}>
                  <Text style={styles.wealthPillText}>{hideWealth ? '••••' : pct(pnlPct)}</Text>
                </View>
                <Text style={styles.wealthAllTime}>all-time</Text>
              </Row>
            </View>
          </MotiView>

          {/* Compact, borderless stats strip under the slim hero — keeps the
              card thin while still surfacing cash / invested / positions. */}
          <Row align="center" style={{ marginTop: spacing.lg }}>
            <MiniStat label="Cash" value={hideWealth ? '••••' : naira(cashBalance)} />
            <View style={styles.miniStatDivider} />
            <MiniStat label="Invested" value={hideWealth ? '••••' : naira(totalCost)} />
            <View style={styles.miniStatDivider} />
            <MiniStat label="Positions" value={String(positions.length)} />
          </Row>
        </View>

        {/* SECTION 2 — Action row. Free-standing pill buttons. */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 320, delay: 120 }}
          style={{ paddingHorizontal: spacing.xl, marginTop: spacing.lg }}
        >
          <Row gap="sm">
            <ActionSquare
              icon="solar:wallet-linear"
              label="Wallet"
              onPress={() => router.push('/wallet' as never)}
            />
            <ActionSquare
              icon="solar:star-linear"
              label="Watchlist"
              onPress={() => router.push('/watchlist' as never)}
            />
            <ActionSquare
              icon="solar:pie-chart-2-linear"
              label="Chart"
              onPress={() => router.push('/allocation')}
            />
          </Row>
        </MotiView>

        {/* Recommended (strictly ethical) — biased to sectors you've traded */}
        <RecommendedRail />

        {/* Error banner */}
        {apiStatus && (
          <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.lg }}>
            <Card style={{ backgroundColor: colors.negativeSubtle, borderColor: 'transparent' }}>
              <Row gap="md" align="flex-start">
                <Icon name="solar:danger-circle-bold" size={22} color={colors.negative} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" tone="negative">Could not load your portfolio</Text>
                  <Text variant="small" tone="muted" selectable style={{ marginTop: spacing.xs }}>{apiStatus}</Text>
                </View>
              </Row>
            </Card>
          </View>
        )}

        {/* Identity KYC prompt — only until identity is verified. */}
        {kycStatus !== 'verified' && (
          <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.lg }}>
            <Pressable
              onPress={() => router.push('/(auth)/kyc')}
              style={({ pressed }) => [
                styles.setupCard,
                pressed && { backgroundColor: colors.bgSubtle },
              ]}
            >
              <Row justify="space-between" align="center">
                <Row gap="md" align="center" style={{ flex: 1 }}>
                  <View style={styles.setupIconWrap}>
                    <Icon name="solar:shield-user-bold" size={22} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">Finish setting up</Text>
                    <Text variant="small" tone="muted" style={{ marginTop: 2 }}>
                      Verify your identity to unlock trading
                    </Text>
                  </View>
                </Row>
                <Icon name="solar:alt-arrow-right-linear" size={18} color={colors.textMuted} />
              </Row>
            </Pressable>
          </View>
        )}

        {/* CSCS review status (under review / rejected + redo). Self-gates:
            renders only when identity KYC is done and CSCS isn't approved.
            No marginTop here — an empty wrapper must add no gap; the notice
            card carries its own top spacing when it renders. */}
        <View style={{ paddingHorizontal: spacing.xl }}>
          <CscsNotice topSpacing />
        </View>

        {/* Holdings / Orders filter */}
        <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
          <View style={styles.tabRow}>
            <TabButton label="Holdings" active={tab === 'holdings'} onPress={() => setTab('holdings')} />
            <TabButton label="Orders" active={tab === 'orders'} onPress={() => setTab('orders')} />
          </View>
        </View>

        <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.lg }}>
          {tab === 'holdings' && (
            positions.length === 0 && !loadingPortfolio ? (
              <EmptyState
                icon="solar:wallet-money-linear"
                title="No holdings yet"
                subtitle="Head to Market to place your first trade."
                cta="Browse market"
                onCta={() => router.push('/(app)/market')}
              />
            ) : (
              <Stack gap="sm">
                {(showAllHoldings ? positions : positions.slice(0, 3)).map(p => (
                  <HoldingRow
                    key={p.symbol}
                    symbol={p.symbol}
                    since={firstBuyDate[p.symbol.toUpperCase()]}
                    quantity={p.quantity}
                    averageCost={p.averageCost}
                    marketValue={p.marketValue}
                    pnl={p.unrealizedPnL}
                    pnlPct={p.unrealizedPnLPercent}
                    onPress={() => router.push({ pathname: '/trade/[symbol]', params: { symbol: p.symbol, from: '/(app)' } })}
                  />
                ))}
                {positions.length > 3 && (
                  <SeeMore
                    label={showAllHoldings ? 'Show less' : `See ${positions.length - 3} more`}
                    expanded={showAllHoldings}
                    onPress={() => setShowAllHoldings(v => !v)}
                  />
                )}
              </Stack>
            )
          )}

          {tab === 'orders' && (
            pacOrders.length === 0 && !loadingOrders ? (
              <EmptyState
                icon="solar:document-text-linear"
                title="No orders yet"
                subtitle="Your buy and sell orders will show here as you trade."
                cta="Start trading"
                onCta={() => router.push('/(app)/market')}
              />
            ) : (
              <Stack gap="sm">
                {pacOrders.slice(0, 3).map(o => (
                  <OrderRow
                    key={o.id}
                    order={o}
                    cancelling={cancellingId === o.id}
                    onPress={() => router.push(`/receipt/${o.id}` as never)}
                    onCancel={async () => {
                      setCancellingId(o.id)
                      try { await cancelOrder(o.id, null) }
                      catch (e) { toast.error('Cancel failed', (e as Error).message) }
                      finally { setCancellingId(null) }
                    }}
                  />
                ))}
                {pacOrders.length > 3 && (
                  <SeeMore label="See all orders" onPress={() => router.push('/orders' as never)} />
                )}
              </Stack>
            )
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function ActionSquare({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles)
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionSquare, pressed && { opacity: 0.55 }]}
    >
      <Icon name={icon} size={26} color={colors.brand} />
      <Text style={styles.actionSquareLabel} numberOfLines={1}>{label}</Text>
    </Pressable>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text variant="eyebrow" tone="subtle">{label}</Text>
      <Text variant="bodyStrong" style={{ marginTop: 2 }} numberOfLines={1}>{value}</Text>
    </View>
  )
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles)
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Text style={{ fontSize: 14, fontWeight: '800', color: active ? colors.textOnBrand : colors.text }}>
        {label}
      </Text>
    </Pressable>
  )
}

const HoldingRow = memo(function HoldingRow({
  symbol, since, quantity, averageCost, marketValue, pnl, pnlPct, onPress,
}: {
  symbol: string
  /** First filled BUY of this stock, e.g. "12 Sep 2026" (omitted when unknown). */
  since?: string
  quantity: number
  averageCost: number
  marketValue: number
  pnl: number
  pnlPct: number
  onPress: () => void
}) {
  const styles = useThemedStyles(makeStyles)
  const up = pnl >= 0
  const strokeColor = up ? colors.positive : colors.negative
  // Deterministic mini series so the chart is stable per symbol.
  const sparkData = useMemo(() => {
    const seed = symbol.split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 1), 0)
    const n = 12
    const points: { value: number }[] = []
    for (let i = 0; i < n; i++) {
      const r = ((seed * (i + 3) * 29) % 1000) / 1000
      const trend = up ? (i / (n - 1)) * 18 : -(i / (n - 1)) * 18
      points.push({ value: 40 + trend + (r - 0.5) * 12 })
    }
    return points
  }, [symbol, up])
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.bgMuted }]}
    >
      <Row gap="md" align="center">
        <StockLogo symbol={symbol} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" numberOfLines={1}>{symbol}</Text>
          <Text variant="small" tone="muted" numberOfLines={1}>
            {quantity.toLocaleString()} shares · avg {naira(averageCost)}
          </Text>
          {since ? <Text variant="small" tone="subtle" numberOfLines={1}>Since {since}</Text> : null}
        </View>
        <View style={{ marginRight: spacing.md, width: 72, height: 32, overflow: 'hidden' }}>
          <LineChart
            data={sparkData}
            width={72}
            height={32}
            initialSpacing={0}
            endSpacing={0}
            spacing={72 / (sparkData.length - 1)}
            thickness={2}
            color={strokeColor}
            areaChart
            startFillColor={strokeColor}
            endFillColor={strokeColor}
            startOpacity={0.25}
            endOpacity={0}
            hideDataPoints
            hideRules
            hideYAxisText
            xAxisThickness={0}
            yAxisThickness={0}
            adjustToWidth
            disableScroll
            curved
          />
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="bodyStrong">{naira(marketValue)}</Text>
          <View style={pnlPillStyle(up)}>
            <Icon name={up ? 'solar:arrow-up-bold' : 'solar:arrow-down-bold'} size={10} color={strokeColor} />
            <Text style={{ fontSize: 11, fontWeight: '800', color: strokeColor, marginLeft: 2 }}>
              {pct(pnlPct)}
            </Text>
          </View>
        </View>
      </Row>
    </Pressable>
  )
})

function SeeMore({ label, expanded, onPress }: { label: string; expanded?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
        paddingVertical: spacing.md, borderRadius: radii.lg,
        backgroundColor: pressed ? colors.bgMuted : 'transparent',
      })}
    >
      <Text variant="smallStrong" tone="brand">{label}</Text>
      <Icon name={expanded ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-right-linear'} size={16} color={colors.brand} />
    </Pressable>
  )
}

function EmptyState({ icon, title, subtitle, cta, onCta }: {
  icon: string
  title: string
  subtitle: string
  cta?: string
  onCta?: () => void
}) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: spacing['3xl'] }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.bgSubtle, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md }}>
        <Icon name={icon} size={26} color={colors.textMuted} />
      </View>
      <Text variant="h3">{title}</Text>
      <Text variant="small" tone="muted" align="center" style={{ marginTop: spacing.xs, marginBottom: cta ? spacing.lg : 0 }}>
        {subtitle}
      </Text>
      {cta && onCta && (
        <Button title={cta} size="sm" fullWidth={false} onPress={onCta} />
      )}
    </Card>
  )
}

// Plain coloured text (no pill background) — the text colour carries up/down.
const pnlPillStyle = (_up: boolean) => ({
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
})

const makeStyles = () => StyleSheet.create({
  wealthCard: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    minHeight: 200,
    backgroundColor: '#0D0E0B', // near-black base under the wealth glow
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  },
  wealthEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 1.4,
  },
  wealthEye: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  wealthValue: {
    fontSize: 38,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -1.2,
    marginTop: spacing.sm,
    lineHeight: 44,
  },
  wealthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  wealthPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  wealthAllTime: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    marginLeft: 4,
  },
  miniStatDivider: {
    width: 1,
    height: 26,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
  },
  wealthDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: spacing.xl,
  },
  wealthSubEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 1.2,
  },
  wealthSubValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.4,
    marginTop: 4,
  },
  wealthBtnPrimary: {
    flex: 1,
    height: 48,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  wealthBtnPrimaryText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#3A4429',
    letterSpacing: -0.2,
  },
  wealthBtnGhost: {
    flex: 1,
    height: 48,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  wealthBtnGhostText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  actionSquare: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: spacing.md,
  },
  actionSquareLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.2,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupCard: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.brand,
    backgroundColor: colors.brandSubtle,
  },
  setupIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.bgSubtle,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: 'transparent',
  },
  tabActive: {
    backgroundColor: colors.brand,
  },
  row: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  allocCard: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: spacing.xs,
  },
  allocTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 1.2,
    marginBottom: spacing.md,
  },
  allocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  allocLegendCol: {
    flex: 1,
    gap: 8,
  },
  allocLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  allocLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  allocLegendSymbol: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
    flex: 1,
    letterSpacing: 0.2,
  },
  allocLegendPct: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  allocCenterVal: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -0.3,
  },
  allocCenterLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginTop: 1,
  },
})
