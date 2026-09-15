import { useEffect, useMemo, useState } from 'react'
import { View, ScrollView, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useShallow } from 'zustand/react/shallow'
import { MotiView } from 'moti'
import { usePortfolioStore } from '@/store/portfolioStore'
import { getSecurityData, type PacMarketData } from '@/lib/pacApi'
import { recommendEthicalSymbols } from '@/lib/sectors'
import { Text, Row, Icon } from '@/ui'
import { colors, spacing, radii } from '@/theme'
import { naira, pct } from '@/lib/format'
import { StockLogo } from './StockLogo'

// Home rail: strictly-ethical recommendations derived ONLY from sectors the
// user has actually traded. Fully static symbol selection (instant), then a
// small parallel quote fetch for just the shown names — never the 150-symbol
// market load. New users (no trade history) get nothing and trigger no fetch.
export function RecommendedRail() {
  const router = useRouter()
  const { positions, pacOrders } = usePortfolioStore(
    useShallow(s => ({ positions: s.positions, pacOrders: s.pacOrders })),
  )

  const traded = useMemo(
    () => Array.from(new Set([...positions.map(p => p.symbol), ...pacOrders.map(o => o.secId)])),
    [positions, pacOrders],
  )
  const symbols = useMemo(() => recommendEthicalSymbols(traded, 8), [traded])
  const symbolKey = symbols.join(',')

  const [quotes, setQuotes] = useState<PacMarketData[] | null>(null)

  useEffect(() => {
    if (symbols.length === 0) { setQuotes([]); return }
    let cancelled = false
    setQuotes(null) // loading
    Promise.all(symbols.map(s => getSecurityData(s).catch(() => null)))
      .then(rs => { if (!cancelled) setQuotes(rs.filter((q): q is PacMarketData => !!q && q.price > 0)) })
    return () => { cancelled = true }
  }, [symbolKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // New user / no sector signal → render nothing at all (no fetch happened).
  if (symbols.length === 0) return null
  // All quotes failed → hide rather than show an empty section.
  if (quotes !== null && quotes.length === 0) return null

  return (
    <View style={{ marginTop: spacing['2xl'] }}>
      <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.md, alignItems: 'center' }}>
        <Row gap="sm" align="center" justify="center">
          <Icon name="solar:leaf-bold" size={18} color={colors.accent} />
          <Text variant="h3">Recommended for you</Text>
        </Row>
        <Text variant="small" tone="muted" align="center" style={{ marginTop: 2 }}>
          Ethical picks in sectors you trade
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}
      >
        {quotes === null
          ? symbols.map((s) => <SkeletonCard key={s} />)
          : quotes.map(s => (
              <RecoCard
                key={s.symbol}
                stock={s}
                onPress={() => router.push({ pathname: '/trade/[symbol]', params: { symbol: s.symbol, from: '/(app)' } })}
              />
            ))}
      </ScrollView>
    </View>
  )
}

function RecoCard({ stock, onPress }: { stock: PacMarketData; onPress: () => void }) {
  const up = (stock.changePercent ?? 0) >= 0
  const tone = up ? colors.positive : colors.negative
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 156, padding: spacing.lg, borderRadius: radii.lg,
        backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
        transform: pressed ? [{ scale: 0.98 }] : undefined,
      })}
    >
      <StockLogo symbol={stock.symbol} size={38} />
      <Text variant="bodyStrong" numberOfLines={1} style={{ marginTop: spacing.md }}>{stock.symbol}</Text>
      <Text variant="small" tone="muted" numberOfLines={1}>{stock.name}</Text>
      <Row justify="space-between" align="flex-end" style={{ marginTop: spacing.sm }}>
        <Text variant="bodyStrong">{naira(stock.price)}</Text>
        <Text style={{ fontSize: 12, fontWeight: '800', color: tone }}>{pct(stock.changePercent ?? 0)}</Text>
      </Row>
    </Pressable>
  )
}

function SkeletonCard() {
  return (
    <MotiView
      from={{ opacity: 0.4 }}
      animate={{ opacity: 0.8 }}
      transition={{ loop: true, type: 'timing', duration: 700 }}
      style={{ width: 156, height: 128, borderRadius: radii.lg, backgroundColor: colors.bgSubtle }}
    />
  )
}
