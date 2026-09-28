import React, { useEffect, useMemo, useState } from 'react'
import { View, StyleSheet, Dimensions } from 'react-native'
import { MotiView } from 'moti'
import Svg, { Line, G, Circle, Path } from 'react-native-svg'
import { Text, Row } from '@/ui'
import { colors, spacing, radii, useThemedStyles } from '@/theme'
import { naira } from '@/lib/format'
import { getHistoricalPrices } from '@/lib/pacApi'

// ─────────────────────────────────────────────────────────────
// Price chart — a simple line of daily closes over 90 days (the candlestick +
// volume version was replaced per the issue log). Real PAC history only;
// skeleton while loading, "unavailable" if there's nothing to plot.
// ─────────────────────────────────────────────────────────────

interface Candle {
  o: number
  h: number
  l: number
  c: number
  v: number
  t: number
}

const DEFAULT_DAYS = 90

function pickNumber(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (v == null) continue
    const n = typeof v === 'string' ? parseFloat(v) : (v as number)
    if (typeof n === 'number' && Number.isFinite(n)) return n
  }
  return null
}

function pickDate(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (v == null) continue
    if (typeof v === 'number') return v > 1e12 ? v : v * 1000
    if (typeof v === 'string') {
      const t = Date.parse(v)
      if (!Number.isNaN(t)) return t
    }
  }
  return null
}

function extractList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>
    if (Array.isArray(r.data)) return r.data
    if (Array.isArray(r.priceHistory)) return r.priceHistory
    if (Array.isArray(r.result)) return r.result
    if (Array.isArray(r.items)) return r.items
    if (Array.isArray(r.prices)) return r.prices
    if (Array.isArray(r.history)) return r.history
  }
  return []
}

function parseCandles(raw: unknown): Candle[] | null {
  const list = extractList(raw)
  if (!Array.isArray(list) || list.length === 0) return null
  const rows: Candle[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const c = pickNumber(r.close, r.closingPrice, r.closePrice, r.lastPrice, r.price)
    if (c == null || c <= 0) continue
    const o = pickNumber(r.open, r.openPrice, r.openingPrice) ?? c
    const h = pickNumber(r.high, r.highPrice, r.dayHigh) ?? Math.max(o, c)
    const l = pickNumber(r.low, r.lowPrice, r.dayLow) ?? Math.min(o, c)
    const v = pickNumber(r.volume, r.vol, r.tradedVolume, r.dailyVolume) ?? 0
    const t = pickDate(r.date, r.tradeDate, r.priceDate, r.timestamp, r.time)
    if (t == null) continue
    rows.push({ o, h, l, c, v, t })
  }
  if (rows.length < 2) return null
  rows.sort((a, b) => a.t - b.t)
  return rows
}


interface Props {
  symbol: string
  price:  number
  isUp:   boolean
  height?: number
}

export function PriceChart({ symbol, price, isUp, height = 220 }: Props) {
  const styles = useThemedStyles(makeStyles)
  const screenW = Dimensions.get('window').width
  const chartW  = screenW - spacing.xl * 2

  const [real, setReal] = useState<Candle[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [selIdx, setSelIdx] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setReal(null)
    setSelIdx(null)
    setLoading(true)
    const today = new Date()
    const from = new Date(today)
    from.setDate(today.getDate() - DEFAULT_DAYS)
    const fmt = (d: Date) => d.toISOString().split('T')[0]
    getHistoricalPrices(symbol, fmt(from), fmt(today))
      .then(raw => { if (!cancelled) setReal(parseCandles(raw)) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [symbol])

  // Price range of the closes (not from zero) so moves are readable.
  const range = useMemo(() => {
    if (!real || real.length < 2) return { lo: 0, hi: 1 }
    const cs = real.map(k => k.c)
    let lo = Math.min(...cs), hi = Math.max(...cs)
    if (hi - lo < 1e-9) { lo = lo * 0.98; hi = hi * 1.02 }
    const pad = (hi - lo) * 0.12
    return { lo: Math.max(0, lo - pad), hi: hi + pad }
  }, [real])

  const useReal = !!real && real.length >= 2

  // Skeleton while the history loads.
  if (loading || real === null) {
    return (
      <View style={styles.wrap}>
        <MotiView
          from={{ opacity: 0.4 }}
          animate={{ opacity: 0.85 }}
          transition={{ loop: true, type: 'timing', duration: 800 }}
          style={{ height, borderRadius: radii.lg, backgroundColor: colors.bgSubtle }}
        />
        <Row justify="space-between" align="center" style={{ marginTop: spacing.sm }}>
          <Text variant="small" tone="subtle">Loading chart…</Text>
          <Text variant="small" tone="subtle">NGX · daily</Text>
        </Row>
      </View>
    )
  }

  // Real data came back but there's nothing to plot.
  if (!useReal) {
    return (
      <View style={styles.wrap}>
        <View style={{ height, borderRadius: radii.lg, backgroundColor: colors.bgSubtle, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="small" tone="subtle">Chart data unavailable</Text>
        </View>
      </View>
    )
  }

  // ── Simple line chart of daily closes (issue log: "something simpler like
  //    line"). Colour follows the period's direction; tap/drag to read a day.
  const pts = real
  const n = pts.length
  const W = chartW
  const H = height
  const PAD_Y = 8
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W)
  const y = (v: number) => PAD_Y + (1 - (v - range.lo) / (range.hi - range.lo)) * (H - PAD_Y * 2)

  const first = pts[0]
  const last = pts[n - 1]
  const periodPct = first.c !== 0 ? ((last.c - first.c) / first.c) * 100 : 0
  const periodUp = periodPct >= 0
  const lineColor = periodUp ? colors.positive : colors.negative

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.c).toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${x(n - 1).toFixed(1)} ${H} L${x(0).toFixed(1)} ${H} Z`

  const shown = selIdx != null ? pts[selIdx] : last
  const shownDate = new Date(shown.t).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
  const pickIdx = (px: number) => Math.max(0, Math.min(n - 1, Math.round((px / W) * (n - 1))))

  return (
    <View style={styles.wrap}>
      <Row justify="space-between" align="center" style={{ marginBottom: spacing.md }}>
        <View>
          <Text variant="bodyStrong">{naira(shown.c, { fractionDigits: 2 })}</Text>
          <Text variant="small" tone="subtle">{selIdx != null ? shownDate : 'Last close'}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="smallStrong" style={{ color: lineColor }}>
            {periodUp ? '+' : '−'}{Math.abs(periodPct).toFixed(2)}%
          </Text>
          <Text variant="small" tone="subtle">{`${n} days`}</Text>
        </View>
      </Row>

      <View
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => setSelIdx(pickIdx(e.nativeEvent.locationX))}
        onResponderMove={(e) => setSelIdx(pickIdx(e.nativeEvent.locationX))}
        onResponderRelease={() => setSelIdx(null)}
        onResponderTerminate={() => setSelIdx(null)}
      >
        <Svg width={W} height={H}>
          <Path d={areaPath} fill={lineColor} fillOpacity={0.08} />
          <Path d={linePath} stroke={lineColor} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {selIdx != null && (
            <G>
              <Line x1={x(selIdx)} x2={x(selIdx)} y1={0} y2={H} stroke={colors.textMuted} strokeWidth={1} strokeDasharray="2 3" />
              <Circle cx={x(selIdx)} cy={y(pts[selIdx].c)} r={4} fill={lineColor} stroke={colors.bg} strokeWidth={2} />
            </G>
          )}
        </Svg>
      </View>

      <Row justify="space-between" align="center" style={{ marginTop: spacing.sm }}>
        <Text variant="small" tone="subtle">Tap and drag to see a day</Text>
        <Text variant="small" tone="subtle">NGX · daily close</Text>
      </Row>
    </View>
  )
}

const makeStyles = () => StyleSheet.create({
  wrap: {
    marginTop: spacing.md,
  },
})
