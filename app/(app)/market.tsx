import { useEffect, useMemo, useState } from 'react'
import { View, FlatList, Pressable, TextInput, StyleSheet, ScrollView } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { RISK_GROUPS, RISK_META } from '@/lib/riskGroups'
import { SafeAreaView } from 'react-native-safe-area-context'
import { usePortfolioStore } from '@/store/portfolioStore'
import { Text, Row, Icon } from '@/ui'
import { colors, spacing, radii, typography, useThemedStyles } from '@/theme'
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar'
import { naira, pct } from '@/lib/format'
import type { PacMarketData } from '@/lib/pacApi'
import { StockLogo } from '@/components/StockLogo'
import { MiniSparkline } from '@/components/MiniSparkline'
import { isEthical } from '@/lib/ethicalTickers'
import { MotiView } from 'moti'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, cancelAnimation, Easing } from 'react-native-reanimated'
import { useShallow } from 'zustand/react/shallow'

interface CategoryMeta {
  key:  string
  label: string
  icon:  string
  bg:    string   // pastel background
  fg:    string   // ink + icon color
}
const CATEGORIES: CategoryMeta[] = [
  { key: 'All',       label: 'All',          icon: 'solar:box-linear',       bg: '#F1F5F9', fg: '#334155' },
  { key: 'Gainers',   label: 'Gainers',      icon: 'solar:arrow-up-bold',    bg: '#DCFCE7', fg: '#166534' },
  { key: 'Losers',    label: 'Losers',       icon: 'solar:arrow-down-bold',  bg: '#FEE2E2', fg: '#991B1B' },
  { key: 'Banking',   label: 'Banking',      icon: 'mdi:bank',               bg: '#DBEAFE', fg: '#1E40AF' },
  { key: 'Cement',    label: 'Cement',       icon: 'mdi:factory',            bg: '#FED7AA', fg: '#C2410C' },
  { key: 'Telecom',   label: 'Telecom',      icon: 'mdi:cellphone-wireless', bg: '#EDE9FE', fg: '#6D28D9' },
  { key: 'Consumer',  label: 'Consumer',     icon: 'mdi:cart-outline',       bg: '#FCE7F3', fg: '#BE185D' },
  { key: 'Oil & Gas', label: 'Oil & Gas',    icon: 'mdi:gas-station',        bg: '#FEF3C7', fg: '#A16207' },
  { key: 'Pharma',    label: 'Pharma',       icon: 'mdi:pill',               bg: '#F5D0FE', fg: '#A21CAF' },
]
type Category = string

// Sector sets — STRICTLY the ethical universe (no non-ethical tickers exist
// anywhere in the codebase). Kept in sync with src/lib/ethicalTickers.ts.
const BANKING  = new Set(['JAIZBANK'])
const CEMENT   = new Set(['DANGCEM', 'BUACEMENT', 'HBMN'])
const TELECOM  = new Set(['MTNN', 'AIRTELAFRI', 'DAARCOMM'])
const CONSUMER = new Set(['NESTLE', 'UNILEVER', 'CADBURY', 'DANGSUGAR', 'HONYFLOUR', 'PZ', 'NASCON', 'BUAFOODS', 'VITAFOAM', 'CHELLARAM', 'TANTALIZER'])
const OIL      = new Set(['SEPLAT', 'OANDO', 'TOTAL', 'ETERNA', 'MRS', 'CONOIL', 'ARADEL', 'JAPAULGOLD'])
const PHARMA   = new Set(['FIDSON', 'MAYBAKER', 'NEIMETH', 'EKOCORP', 'MORISON', 'MECURE', 'JULI'])

// Risk buckets — ethical universe only.
//   LOW    — mega-cap blue-chips: proven moats, stable, dividend payers.
//   MEDIUM — large-cap growth / industrials / pharma.
//   HIGH   — small/mid-cap, commodity-exposed or speculative names.
// Risk buckets now live in @/lib/riskGroups (shared with the Invest risk dial).
const RISK_LOW = RISK_GROUPS.low
const RISK_MEDIUM = RISK_GROUPS.medium
const RISK_HIGH = RISK_GROUPS.high

type FilterMode = 'all' | 'ethical'
type RiskLevel  = 'low' | 'medium' | 'high'

export default function MarketScreen() {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const params = useLocalSearchParams<{ filter?: string; risk?: string; search?: string }>()
  const filterMode: FilterMode = params.filter === 'ethical' ? 'ethical' : 'all'

  // Build a "return to this exact page" URL for the trade screen to bounce
  // back to. Modal presentation loses the tab-history otherwise (goes home).
  const currentPath = () => {
    const qs: string[] = []
    if (params.filter) qs.push(`filter=${params.filter}`)
    if (params.risk)   qs.push(`risk=${params.risk}`)
    return '/(app)/market' + (qs.length ? `?${qs.join('&')}` : '')
  }
  const risk: RiskLevel | null =
    params.risk === 'low' || params.risk === 'medium' || params.risk === 'high'
      ? params.risk
      : null
  const { marketData, loadingMarket, loadMarketData, apiStatus } = usePortfolioStore(useShallow((s) => ({ marketData: s.marketData, loadingMarket: s.loadingMarket, loadMarketData: s.loadMarketData, apiStatus: s.apiStatus })))
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category>('All')

  useEffect(() => { if (marketData.length === 0) loadMarketData() }, [])

  const universe = useMemo(() => {
    let list = filterMode === 'ethical' ? marketData.filter(s => isEthical(s.symbol)) : marketData
    if (risk === 'low')    list = list.filter(s => RISK_LOW.has(s.symbol))
    if (risk === 'medium') list = list.filter(s => RISK_MEDIUM.has(s.symbol))
    if (risk === 'high')   list = list.filter(s => RISK_HIGH.has(s.symbol))
    return list
  }, [marketData, filterMode, risk])

  const filtered = useMemo(() => {
    let list = universe
    if (category === 'Gainers')   list = list.filter(s => s.changePercent > 0)
    if (category === 'Losers')    list = list.filter(s => s.changePercent < 0)
    if (category === 'Banking')   list = list.filter(s => BANKING.has(s.symbol))
    if (category === 'Cement')    list = list.filter(s => CEMENT.has(s.symbol))
    if (category === 'Telecom')   list = list.filter(s => TELECOM.has(s.symbol))
    if (category === 'Consumer')  list = list.filter(s => CONSUMER.has(s.symbol))
    if (category === 'Oil & Gas') list = list.filter(s => OIL.has(s.symbol))
    if (category === 'Pharma')    list = list.filter(s => PHARMA.has(s.symbol))
    if (query.trim()) {
      const q = query.trim().toUpperCase()
      list = list.filter(s => s.symbol.includes(q) || s.name.toUpperCase().includes(q))
    }
    return list
  }, [universe, category, query])

  const title    = risk ? `${RISK_META[risk].label} stocks`
                 : filterMode === 'ethical' ? 'Ethical Stocks'  : 'NGX Stocks'

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.symbol}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE + spacing.lg }}
        onRefresh={loadMarketData}
        // refreshing=true only when the user is pulling to refresh AFTER
        // data has arrived. During initial load the skeleton renders in
        // ListEmptyComponent — showing the native spinner too is double UI.
        refreshing={loadingMarket && marketData.length > 0}
        ItemSeparatorComponent={ListSeparator}
        renderItem={({ item }) => <StockRow item={item} onPress={() => router.push({ pathname: '/trade/[symbol]', params: { symbol: item.symbol, from: currentPath() } })} />}
        ListHeaderComponent={
          <View>
            {/* Header — back button pinned left, title centered, editorial
                market-status line beneath. No breadth strip, no top-movers
                carousel: clean and scannable. */}
            <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
                <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconButton}>
                  <Icon name="solar:alt-arrow-left-linear" size={20} color={colors.text} />
                </Pressable>
                <View style={{ position: 'absolute', left: 0, right: 0, alignItems: 'center', pointerEvents: 'none' }}>
                  <Text variant="h2">{title}</Text>
                </View>
              </View>
              <View style={{ marginTop: spacing.md, alignItems: 'center' }}>
                <MarketStatusLine />
              </View>
            </View>

            {/* Search */}
            <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.lg }}>
              <View style={styles.search}>
                <Icon name="solar:magnifer-linear" size={18} color={colors.textMuted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search by ticker or name"
                  placeholderTextColor={colors.textSubtle}
                  style={styles.searchInput}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="search"
                  // Invest page's search button opens the market with ?search=1.
                  autoFocus={params.search === '1'}
                />
                {query.length > 0 && (
                  <Pressable onPress={() => setQuery('')} hitSlop={8}>
                    <Icon name="solar:close-circle-bold" size={18} color={colors.textSubtle} />
                  </Pressable>
                )}
              </View>
            </View>

            {/* Colorful category chips — icon + label per category */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm, marginTop: spacing.md }}
            >
              {CATEGORIES.map(c => {
                const active = category === c.key
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => setCategory(c.key)}
                    style={({ pressed }) => [
                      styles.catChip,
                      { backgroundColor: c.bg },
                      active && { borderColor: c.fg, borderWidth: 2 },
                      pressed && { transform: [{ scale: 0.97 }] },
                    ]}
                  >
                    <Icon name={c.icon} size={16} color={c.fg} />
                    <Text style={[styles.catChipText, { color: c.fg }]}>{c.label}</Text>
                  </Pressable>
                )
              })}
            </ScrollView>

            {/* List section header */}
            <Row justify="space-between" style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'], marginBottom: spacing.md }}>
              <Text variant="eyebrow" tone="muted">
                {category === 'All' ? 'ALL EQUITIES' : String(category).toUpperCase()}
              </Text>
              <Text variant="small" tone="muted">
                {filtered.length}{filtered.length !== universe.length ? ` of ${universe.length}` : ''}
              </Text>
            </Row>
          </View>
        }
        ListEmptyComponent={
          loadingMarket ? (
            <MarketSkeletonList count={10} />
          ) : (
            <View style={{ padding: spacing['3xl'], alignItems: 'center' }}>
              <Icon name="solar:magnifer-zoom-in-linear" size={40} color={colors.textSubtle} />
              <Text variant="bodyStrong" tone="muted" style={{ marginTop: spacing.md }} align="center">
                {apiStatus ? 'Could not load market data' : 'No matches'}
              </Text>
              {apiStatus && (
                <Text variant="small" tone="negative" align="center" style={{ marginTop: spacing.sm }} selectable>
                  {apiStatus}
                </Text>
              )}
              {!apiStatus && (
                <Text variant="small" tone="subtle" align="center" style={{ marginTop: spacing.sm }}>
                  Try a different search or category.
                </Text>
              )}
            </View>
          )
        }
      />
    </SafeAreaView>
  )
}

function ListSeparator() {
  return <View style={{ height: 1, backgroundColor: colors.border, marginLeft: spacing.xl + 40 + spacing.md }} />
}

// Skeleton row that visually mimics a StockRow while the first market fetch
// is in flight. Uses a MotiView shimmer via opacity pulse so the list feels
// alive, not frozen — much better than a full-screen spinner over blank.
function MarketSkeletonList({ count }: { count: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <MarketSkeletonRow key={i} delay={i * 60} />
      ))}
    </View>
  )
}

function MarketSkeletonRow({ delay }: { delay: number }) {
  return (
    <MotiView
      from={{ opacity: 0.4 }}
      animate={{ opacity: 0.9 }}
      transition={{ type: 'timing', duration: 800, loop: true, repeatReverse: true, delay }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.md,
      }}
    >
      {/* Logo bubble */}
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgSubtle }} />
      {/* Symbol + name */}
      <View style={{ flex: 1, marginLeft: spacing.md, gap: 6 }}>
        <View style={{ height: 12, width: '30%', borderRadius: 6, backgroundColor: colors.bgSubtle }} />
        <View style={{ height: 10, width: '60%', borderRadius: 5, backgroundColor: colors.bgSubtle }} />
      </View>
      {/* Sparkline placeholder */}
      <View style={{ width: 60, height: 22, borderRadius: 6, backgroundColor: colors.bgSubtle, marginRight: spacing.md }} />
      {/* Price + change */}
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <View style={{ height: 12, width: 60, borderRadius: 6, backgroundColor: colors.bgSubtle }} />
        <View style={{ height: 10, width: 40, borderRadius: 5, backgroundColor: colors.bgSubtle }} />
      </View>
    </MotiView>
  )
}

function StockRow({ item, onPress }: { item: PacMarketData; onPress: () => void }) {
  const up = item.changePercent >= 0
  const change = item.change ?? 0
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing.md,
          backgroundColor: pressed ? colors.bgSubtle : 'transparent',
        },
      ]}
    >
      <Row gap="md" align="center">
        <StockLogo symbol={item.symbol} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" numberOfLines={1} style={{ fontSize: 15 }}>
            {item.name || item.symbol}
          </Text>
          <Text
            variant="small"
            tone="subtle"
            numberOfLines={1}
            style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginTop: 1 }}
          >
            {item.symbol}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', minWidth: 96 }}>
          <Text variant="bodyStrong" style={{ fontSize: 15 }}>{naira(item.price)}</Text>
          <Row gap="xs" align="center" style={{ marginTop: 2 }}>
            <Text style={{
              fontSize: 12,
              fontWeight: '700',
              color: up ? colors.positive : colors.negative,
            }}>
              {up ? '+' : ''}₦{Math.abs(change).toFixed(2)}
            </Text>
            <Icon name={up ? 'solar:arrow-up-bold' : 'solar:arrow-down-bold'} size={11} color={up ? colors.positive : colors.negative} />
            <Text style={{
              fontSize: 12,
              fontWeight: '800',
              color: up ? colors.positive : colors.negative,
            }}>
              {Math.abs(item.changePercent).toFixed(2)}%
            </Text>
          </Row>
        </View>
      </Row>
    </Pressable>
  )
}

// ─────────────────────────────────────────────────────────────
// MarketHoursPill — NGX runs Mon–Fri 09:00–14:30 WAT (UTC+1, no DST).
// Renders nothing when the market is open. When closed, renders a small
// muted pill telling the user when it next opens, so trades placed
// outside hours don't feel like a bug.
// ─────────────────────────────────────────────────────────────
// Editorial (non-pill) market-status line — small colored dot + a plain
// sentence in mono font. Green pulsing dot when the exchange is open,
// muted static dot when closed. Ported from Niqra-web's MarketStatusLine
// so both apps read the same. Re-checks every 30s.
function MarketStatusLine() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  const status = ngxMarketStatus(now)
  const text = status.open
    ? 'NGX open · trading until 14:30 WAT'
    : status.label
        .replace(/^CLOSED\s·\s/, 'NGX closed · ')
        .toLowerCase()
        .replace(/^ngx/, 'NGX')
        .replace('closed · opens', 'closed, opens')

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <StatusDot open={status.open} />
      <Text
        variant="small"
        tone="muted"
        style={{ fontFamily: 'monospace', letterSpacing: -0.1 }}
      >
        {text}
      </Text>
    </View>
  )
}

// Pulsing green dot when open, static grey dot when closed.
function StatusDot({ open }: { open: boolean }) {
  const ping = useSharedValue(0)
  useEffect(() => {
    if (!open) return
    ping.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    )
    return () => cancelAnimation(ping)
  }, [open, ping])

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.6 * (1 - ping.value),
    transform: [{ scale: 1 + ping.value * 1.8 }],
  }))

  return (
    <View style={{ width: 8, height: 8, alignItems: 'center', justifyContent: 'center' }}>
      {open && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: colors.positive,
            },
            ringStyle,
          ]}
        />
      )}
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: open ? colors.positive : colors.textSubtle,
        }}
      />
    </View>
  )
}

// Returns whether NGX is currently open + a short human label for when it
// isn't. Uses WAT = UTC + 1 (no DST). NGX trades continuously 09:00–14:30
// on business days.
function ngxMarketStatus(now: Date): { open: boolean; label: string } {
  const watMs   = now.getTime() + 60 * 60 * 1000
  const wat     = new Date(watMs)
  const day     = wat.getUTCDay() // 0 Sun … 6 Sat
  const minsWat = wat.getUTCHours() * 60 + wat.getUTCMinutes()
  const OPEN    = 9 * 60
  const CLOSE   = 14 * 60 + 30
  const isWeekday = day >= 1 && day <= 5
  if (isWeekday && minsWat >= OPEN && minsWat <= CLOSE) return { open: true, label: 'OPEN' }

  // Closed. Build a short label describing when it next opens.
  if (!isWeekday || minsWat > CLOSE) {
    // After today's close, or weekend — next weekday 09:00.
    let addDays = 1
    if (day === 5 && minsWat > CLOSE) addDays = 3   // Fri → Mon
    else if (day === 6)               addDays = 2   // Sat → Mon
    else if (day === 0)               addDays = 1   // Sun → Mon
    const label = addDays === 1 ? 'CLOSED · OPENS 09:00 TOMORROW' : 'CLOSED · OPENS MONDAY 09:00'
    return { open: false, label }
  }
  // Before 09:00 on a weekday.
  return { open: false, label: 'CLOSED · OPENS 09:00' }
}

const marketPillStyle = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 6,
}
const marketPillDot = {
  width: 6,
  height: 6,
  borderRadius: 3,
  backgroundColor: colors.textSubtle,
}
const chgPillStyle = (_up: boolean) => ({
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
})

const makeStyles = () => StyleSheet.create({
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breadthStrip: {
    flexDirection: 'row',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  breadthDivider: {
    width: 1,
    backgroundColor: colors.border,
    alignSelf: 'stretch',
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    height: 48,
  },
  searchInput: {
    flex: 1,
    ...typography.bodyStrong,
    color: colors.text,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: 'transparent',
    minHeight: 44,
  },
  catChipText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  moverCard: {
    width: 160,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
})
