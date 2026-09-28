import { useEffect, useMemo } from 'react'
import { View, ScrollView, Pressable, RefreshControl } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useShallow } from 'zustand/react/shallow'
import { usePortfolioStore } from '@/store/portfolioStore'
import { useWatchlistStore } from '@/store/watchlistStore'
import { Text, Row, Stack, Button, Icon, Loader, toast, SkeletonList } from '@/ui'
import { colors, spacing, radii } from '@/theme'
import { naira, pct } from '@/lib/format'
import { StockLogo } from '@/components/StockLogo'

export default function WatchlistScreen() {
  const router = useRouter()
  const { symbols, loading, load, toggle } = useWatchlistStore(useShallow(s => ({
    symbols: s.symbols, loading: s.loading, load: s.load, toggle: s.toggle,
  })))
  const { marketData, loadMarketData, loadingMarket } = usePortfolioStore(useShallow(s => ({
    marketData: s.marketData, loadMarketData: s.loadMarketData, loadingMarket: s.loadingMarket,
  })))

  useEffect(() => { load() }, [])
  useEffect(() => { if (marketData.length === 0) loadMarketData() }, [])

  // Join watched symbols with live market data (falls back to a bare row).
  const rows = useMemo(() => {
    const bySym = new Map(marketData.map(m => [m.symbol, m]))
    return symbols.map(sym => bySym.get(sym) ?? {
      symbol: sym, name: sym, price: 0, change: 0, changePercent: 0, volume: 0, high: 0, low: 0, open: 0,
    })
  }, [symbols, marketData])

  const refresh = () => { load(); loadMarketData() }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Row gap="md" align="center" style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ width: 40, height: 40, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSubtle }}>
          <Icon name="solar:alt-arrow-left-linear" size={20} color={colors.text} />
        </Pressable>
        <Text variant="h2">Watchlist</Text>
      </Row>

      {loading && symbols.length === 0 ? (
        <SkeletonList rows={6} />
      ) : symbols.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.bgSubtle, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md }}>
            <Icon name="solar:star-linear" size={26} color={colors.textMuted} />
          </View>
          <Text variant="h3">No stocks watched yet</Text>
          <Text variant="small" tone="muted" align="center" style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}>
            Tap the star on any stock to keep an eye on it here.
          </Text>
          <Button title="Browse market" size="sm" fullWidth={false} onPress={() => router.push('/(app)/market')} />
        </View>
      ) : (
        <Animated.View entering={FadeIn.duration(220)} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing['3xl'] }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loadingMarket} onRefresh={refresh} tintColor={colors.brand} />}
        >
          <Stack gap="sm">
            {rows.map(s => {
              const up = s.changePercent >= 0
              return (
                <Pressable
                  key={s.symbol}
                  onPress={() => router.push({ pathname: '/trade/[symbol]', params: { symbol: s.symbol } })}
                  style={({ pressed }) => [{
                    padding: spacing.lg, borderRadius: radii.lg, borderWidth: 1,
                    borderColor: colors.border, backgroundColor: pressed ? colors.bgMuted : colors.surface,
                  }]}
                >
                  <Row gap="md" align="center">
                    <StockLogo symbol={s.symbol} size={44} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="bodyStrong" numberOfLines={1}>{s.symbol}</Text>
                      <Text variant="small" tone="muted" numberOfLines={1}>{s.name}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text variant="bodyStrong">{s.price > 0 ? naira(s.price) : '-'}</Text>
                      {s.price > 0 && (
                        <Row gap="xs" align="center">
                          <Icon name={up ? 'solar:arrow-up-bold' : 'solar:arrow-down-bold'} size={10} color={up ? colors.positive : colors.negative} />
                          <Text style={{ fontSize: 11, fontWeight: '800', color: up ? colors.positive : colors.negative }}>{pct(s.changePercent)}</Text>
                        </Row>
                      )}
                    </View>
                    <Pressable
                      onPress={async () => { try { await toggle(s.symbol) } catch (e) { toast.error('Watchlist', (e as Error).message) } }}
                      hitSlop={10}
                      style={{ marginLeft: spacing.sm, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSubtle }}
                    >
                      <Icon name="solar:star-bold" size={16} color={colors.brand} />
                    </Pressable>
                  </Row>
                </Pressable>
              )
            })}
          </Stack>
        </ScrollView>
        </Animated.View>
      )}
    </SafeAreaView>
  )
}
