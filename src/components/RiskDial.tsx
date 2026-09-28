import { useEffect, useMemo, useState } from 'react'
import { View, Pressable } from 'react-native'
import { MotiView } from 'moti'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Text, Icon, SkeletonRow } from '@/ui'
import { colors, spacing, radii } from '@/theme'
import { naira, pct } from '@/lib/format'
import type { PacMarketData } from '@/lib/pacApi'
import { StockLogo } from '@/components/StockLogo'
import { RISK_GROUPS, RISK_META, isRiskKey, type RiskKey } from '@/lib/riskGroups'

// "By risk level" as ONE card: a Conservative / Balanced / Growth switch, a gold
// 5-bar meter (not red/amber/green boxes), a plain-English blurb, the first
// three stocks of that mix with live prices, and "View all". The last choice is
// remembered on the device.

const STORE_KEY = 'invest:risk'
const ORDER: RiskKey[] = ['low', 'medium', 'high']

export function RiskDial({ marketData, onViewAll, onOpenStock }: {
  marketData: PacMarketData[]
  onViewAll: (risk: RiskKey) => void
  onOpenStock: (symbol: string) => void
}) {
  const [risk, setRisk] = useState<RiskKey>('low')

  // Restore the last selection (issue log: "remember last selection of risk level").
  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY).then((v) => { if (isRiskKey(v)) setRisk(v) }).catch(() => {})
  }, [])
  const choose = (k: RiskKey) => {
    setRisk(k)
    AsyncStorage.setItem(STORE_KEY, k).catch(() => {})
  }

  const inMix = useMemo(() => {
    const group = RISK_GROUPS[risk]
    const bySymbol = new Map(marketData.map((m) => [m.symbol.toUpperCase(), m]))
    // Keep the group's own order (roughly largest / steadiest first).
    return Array.from(group).map((s) => bySymbol.get(s)).filter((m): m is PacMarketData => !!m)
  }, [marketData, risk])

  const meta = RISK_META[risk]

  return (
    <View style={{ borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.lg }}>
      {/* Level switch */}
      <View style={{ flexDirection: 'row', padding: 4, borderRadius: radii.md, backgroundColor: colors.bgSubtle }}>
        {ORDER.map((k) => {
          const active = k === risk
          return (
            <Pressable
              key={k}
              onPress={() => choose(k)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={{ flex: 1, paddingVertical: spacing.sm, borderRadius: radii.md - 2, alignItems: 'center', backgroundColor: active ? colors.brand : 'transparent' }}
            >
              <Text variant="smallStrong" style={{ color: active ? colors.textOnBrand : colors.textMuted }}>{RISK_META[k].label}</Text>
            </Pressable>
          )
        })}
      </View>

      <MotiView key={risk} from={{ opacity: 0, translateY: 6 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 220 }}>
        {/* Gold meter */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg }}>
          <Text variant="small" tone="muted" style={{ marginRight: spacing.md }}>Risk</Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={{ width: 10, height: 6 + i * 3, borderRadius: 2, backgroundColor: i <= meta.meter ? colors.accent : colors.border }} />
            ))}
          </View>
          <Text variant="small" tone="subtle" style={{ marginLeft: spacing.md }}>
            {meta.meter <= 2 ? 'Lower ups and downs' : meta.meter === 3 ? 'Moderate ups and downs' : 'Bigger ups and downs'}
          </Text>
        </View>

        <Text variant="small" tone="muted" style={{ marginTop: spacing.md, lineHeight: 20 }}>{meta.blurb}</Text>

        {/* First three stocks of the mix, live */}
        <View style={{ marginTop: spacing.md }}>
          {inMix.length === 0 ? (
            <View>{[0, 1, 2].map((i) => <SkeletonRow key={i} />)}</View>
          ) : inMix.slice(0, 3).map((m, i) => {
            const up = (m.changePercent ?? 0) >= 0
            return (
              <Pressable
                key={m.symbol}
                onPress={() => onOpenStock(m.symbol)}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm,
                  borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <StockLogo symbol={m.symbol} size={34} />
                <View style={{ flex: 1, minWidth: 0, marginLeft: spacing.md }}>
                  <Text variant="bodyStrong" numberOfLines={1}>{m.symbol}</Text>
                  <Text variant="small" tone="muted" numberOfLines={1}>{m.name}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="bodyStrong">{naira(m.price)}</Text>
                  <Text variant="small" style={{ color: up ? colors.positive : colors.negative }}>{pct(m.changePercent ?? 0)}</Text>
                </View>
              </Pressable>
            )
          })}
        </View>

        <Pressable
          onPress={() => onViewAll(risk)}
          hitSlop={8}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 })}
        >
          <Text variant="smallStrong" tone="accent">View all {inMix.length || ''} {meta.label.toLowerCase()} stocks</Text>
          <Icon name="solar:alt-arrow-right-linear" size={18} color={colors.accent} />
        </Pressable>
      </MotiView>
    </View>
  )
}
