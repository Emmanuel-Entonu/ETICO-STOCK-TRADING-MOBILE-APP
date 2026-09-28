import { useMemo } from 'react'
import { View, Pressable } from 'react-native'
import { Text, Icon } from '@/ui'
import { colors, spacing, radii } from '@/theme'
import { naira, pct } from '@/lib/format'
import type { PacMarketData } from '@/lib/pacApi'
import { StockLogo } from '@/components/StockLogo'
import { isEthical } from '@/lib/ethicalTickers'
import { RISK_META, type RiskKey } from '@/lib/riskGroups'

// Results for the Assets page search: our OFFERINGS (products + risk mixes) and
// individual STOCKS, matched as the user types. Tapping an offering opens it;
// tapping a stock opens its trade screen.

interface Offering {
  key: string
  title: string
  subtitle: string
  icon: string
  keywords: string
  route?: string          // undefined → "Coming soon"
}

const OFFERINGS: Offering[] = [
  { key: 'stocks', title: 'Ethical Stocks', subtitle: 'Shariah- and ESG-screened NGX equities', icon: 'solar:leaf-bold', keywords: 'ethical stocks shares equities ngx halal shariah esg', route: '/(app)/market?filter=ethical' },
  { key: 'all', title: 'All NGX stocks', subtitle: 'The full screened market', icon: 'solar:chart-2-bold', keywords: 'all market ngx stocks shares equities exchange', route: '/(app)/market' },
  { key: 'bonds', title: 'Ethical Bonds', subtitle: 'Fixed-income instruments', icon: 'solar:document-text-bold', keywords: 'bonds sukuk fixed income treasury' },
  { key: 'savings', title: 'Ethical Savings', subtitle: 'Grow cash the ethical way', icon: 'solar:money-bag-bold', keywords: 'savings cash deposit interest-free' },
  ...(['low', 'medium', 'high'] as RiskKey[]).map((k) => ({
    key: `risk-${k}`,
    title: `${RISK_META[k].label} stocks`,
    subtitle: RISK_META[k].blurb,
    icon: k === 'low' ? 'solar:shield-check-bold' : k === 'medium' ? 'solar:chart-2-bold' : 'solar:arrow-up-bold',
    keywords: `${RISK_META[k].label} risk ${k} ${k === 'low' ? 'safe conservative dividend' : k === 'medium' ? 'balanced moderate' : 'growth aggressive high'}`,
    route: `/(app)/market?risk=${k}`,
  })),
]

export function AssetSearch({ query, marketData, onOpen }: {
  query: string
  marketData: PacMarketData[]
  onOpen: (route: string) => void
}) {
  const q = query.trim().toLowerCase()

  const offerings = useMemo(() => {
    if (!q) return OFFERINGS
    return OFFERINGS.filter((o) => `${o.title} ${o.keywords}`.toLowerCase().includes(q))
  }, [q])

  const stocks = useMemo(() => {
    if (!q) return []
    const Q = q.toUpperCase()
    return marketData
      .filter((s) => s.symbol.includes(Q) || s.name.toUpperCase().includes(Q))
      // Ticker prefix matches first, then ethical, then by name.
      .sort((a, b) => Number(b.symbol.startsWith(Q)) - Number(a.symbol.startsWith(Q))
        || Number(isEthical(b.symbol)) - Number(isEthical(a.symbol))
        || a.symbol.localeCompare(b.symbol))
      .slice(0, 25)
  }, [q, marketData])

  const nothing = q && offerings.length === 0 && stocks.length === 0

  return (
    <View style={{ paddingHorizontal: spacing.lg }}>
      {offerings.length > 0 && (
        <>
          <Text variant="eyebrow" tone="muted" style={{ marginBottom: spacing.sm }}>{q ? 'OFFERINGS' : 'BROWSE OFFERINGS'}</Text>
          <View style={{ borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden', marginBottom: spacing.xl }}>
            {offerings.map((o, i) => (
              <Pressable
                key={o.key}
                disabled={!o.route}
                onPress={() => o.route && onOpen(o.route)}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md,
                  borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border,
                  backgroundColor: pressed ? colors.bgSubtle : 'transparent',
                })}
              >
                <View style={{ width: 36, height: 36, borderRadius: radii.md, backgroundColor: colors.brandSubtle, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={o.icon} size={18} color={colors.brand} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>{o.title}</Text>
                  <Text variant="small" tone="muted" numberOfLines={1}>{o.subtitle}</Text>
                </View>
                {o.route
                  ? <Icon name="solar:alt-arrow-right-linear" size={18} color={colors.textMuted} />
                  : <Text variant="small" tone="subtle">Coming soon</Text>}
              </Pressable>
            ))}
          </View>
        </>
      )}

      {stocks.length > 0 && (
        <>
          <Text variant="eyebrow" tone="muted" style={{ marginBottom: spacing.sm }}>STOCKS</Text>
          <View style={{ borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' }}>
            {stocks.map((s, i) => {
              const up = (s.changePercent ?? 0) >= 0
              return (
                <Pressable
                  key={s.symbol}
                  onPress={() => onOpen(`/trade/${s.symbol}`)}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md,
                    borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border,
                    backgroundColor: pressed ? colors.bgSubtle : 'transparent',
                  })}
                >
                  <StockLogo symbol={s.symbol} size={36} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="bodyStrong" numberOfLines={1}>{s.symbol}</Text>
                    <Text variant="small" tone="muted" numberOfLines={1}>{s.name}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text variant="bodyStrong">{s.price > 0 ? naira(s.price) : '-'}</Text>
                    {s.price > 0 ? <Text variant="small" style={{ color: up ? colors.positive : colors.negative }}>{pct(s.changePercent ?? 0)}</Text> : null}
                  </View>
                </Pressable>
              )
            })}
          </View>
        </>
      )}

      {nothing ? (
        <View style={{ alignItems: 'center', paddingVertical: spacing['3xl'], gap: spacing.sm }}>
          <Icon name="solar:magnifer-zoom-in-linear" size={36} color={colors.textSubtle} />
          <Text variant="bodyStrong">No matches for “{query.trim()}”</Text>
          <Text variant="small" tone="muted">Try a ticker like DANGCEM, a company name, or “bonds”.</Text>
        </View>
      ) : null}
    </View>
  )
}
