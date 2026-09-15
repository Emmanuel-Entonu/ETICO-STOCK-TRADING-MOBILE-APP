import React, { useEffect, useMemo, useState } from 'react'
import { View, StyleSheet, Dimensions } from 'react-native'
import { MotiView } from 'moti'
import Svg, { Line, Rect, G, Circle, Text as SvgText } from 'react-native-svg'
import { Text, Row } from '@/ui'
import { colors, spacing, radii, useThemedStyles } from '@/theme'
import { naira } from '@/lib/format'
import { getHistoricalPrices } from '@/lib/pacApi'

// ─────────────────────────────────────────────────────────────
// Candle chart — mobile port of Niqra-web's CandleChart. Same OHLC + volume
// composition, same "real if available, symbol-seeded synthetic if not"
// pattern. No timeframe selector — always 90 days. If PAC returns fewer
// than 2 real candles, we render a deterministic placeholder so the tile
// never looks empty.
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

  const ceil = useMemo(() => {
    if (real && real.length > 0) return Math.max(...real.map(k => k.h)) * 1.1
    return (price || 100) * 1.4
  }, [real, price])

  const ticksMemo = useMemo(() => {
    const step = Math.pow(10, Math.floor(Math.log10(Math.max(ceil, 1))))
    const values = [ceil, ceil * 0.67, ceil * 0.33, 0].map(v => Math.round(v / step) * step)
    return Array.from(new Set(values))
  }, [ceil])

  const useReal = !!real && real.length >= 2

  // Skeleton while the history loads — no synthetic fallback anymore.
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

  const candles = real
  const n = candles.length
  const maxVol = Math.max(1, ...candles.map(k => k.v))

  // Layout in SVG units
  const VB_W = chartW
  const VB_H = height
  const AXIS_W = 44
  const VOL_H = 40
  const GAP = 6
  const PLOT_H = VB_H - VOL_H - GAP

  const plotW = VB_W - AXIS_W
  const slot = plotW / n
  const bodyW = Math.max(1.5, slot * 0.58)
  const xMid = (i: number) => i * slot + slot / 2
  const yPrice = (v: number) => (1 - v / ceil) * PLOT_H

  const first = candles[0]
  const last = candles[n - 1]
  const headerChangePct = first.o !== 0 ? ((last.c - first.o) / first.o) * 100 : 0
  const headerUp = headerChangePct >= 0
  const activeColor = isUp ? colors.positive : colors.negative
  const upColor = colors.positive
  const downColor = colors.negative

  const ticks = ticksMemo

  // Tap / drag scrubbing — the candle under the finger drives the header OHLC
  // and a crosshair, so users read the exact value at any point.
  const shown = selIdx != null ? candles[selIdx] : last
  const shownUp = shown.c >= shown.o
  const pickIdx = (x: number) => Math.max(0, Math.min(n - 1, Math.floor(x / slot)))

  return (
    <View style={styles.wrap}>
      {/* Header line: OHLC of the last (or the finger-selected) candle */}
      <Row justify="space-between" align="center" style={{ marginBottom: spacing.md }}>
        <Row gap="md" align="baseline">
          <Text variant="eyebrow" tone="muted">O · {naira(shown.o, { fractionDigits: 2 })}</Text>
          <Text variant="eyebrow" tone="muted">H · {naira(shown.h, { fractionDigits: 2 })}</Text>
          <Text variant="eyebrow" tone="muted">L · {naira(shown.l, { fractionDigits: 2 })}</Text>
          <Text variant="eyebrow" style={{ color: shownUp ? upColor : downColor }}>C · {naira(shown.c, { fractionDigits: 2 })}</Text>
        </Row>
        <Text
          variant="smallStrong"
          style={{ color: headerUp ? upColor : downColor }}
        >
          {headerUp ? '+' : '−'}{Math.abs(headerChangePct).toFixed(2)}%
        </Text>
      </Row>

      <View
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => setSelIdx(pickIdx(e.nativeEvent.locationX))}
        onResponderMove={(e) => setSelIdx(pickIdx(e.nativeEvent.locationX))}
      >
      <Svg width={VB_W} height={VB_H} viewBox={`0 0 ${VB_W} ${VB_H}`}>
        {/* Gridlines + right-axis ticks */}
        {ticks.map(t => (
          <G key={t}>
            <Line
              x1={0}
              x2={plotW}
              y1={yPrice(t)}
              y2={yPrice(t)}
              stroke={colors.border}
              strokeWidth={1}
            />
            <SvgText
              x={VB_W - 4}
              y={yPrice(t) + 4}
              textAnchor="end"
              fill={colors.textSubtle}
              fontSize={9}
              fontWeight="600"
            >
              {t.toFixed(0)}
            </SvgText>
          </G>
        ))}

        {/* Last-close guide (dashed) */}
        <Line
          x1={0}
          x2={plotW}
          y1={yPrice(last.c)}
          y2={yPrice(last.c)}
          stroke={activeColor}
          strokeOpacity={0.5}
          strokeDasharray="3 4"
          strokeWidth={1}
        />

        {/* Candles */}
        <G>
          {candles.map((k, i) => {
            const color = k.c >= k.o ? upColor : downColor
            const top = yPrice(Math.max(k.o, k.c))
            const bottom = yPrice(Math.min(k.o, k.c))
            return (
              <G key={i}>
                <Line
                  x1={xMid(i)}
                  x2={xMid(i)}
                  y1={yPrice(k.h)}
                  y2={yPrice(k.l)}
                  stroke={color}
                  strokeWidth={1}
                />
                <Rect
                  x={xMid(i) - bodyW / 2}
                  y={top}
                  width={bodyW}
                  height={Math.max(1, bottom - top)}
                  fill={color}
                />
              </G>
            )
          })}
        </G>

        {/* Volume strip */}
        <G transform={`translate(0 ${PLOT_H + GAP})`}>
          {candles.map((k, i) => {
            const h = (k.v / maxVol) * VOL_H
            return (
              <Rect
                key={i}
                x={xMid(i) - bodyW / 2}
                y={VOL_H - h}
                width={bodyW}
                height={h}
                fill={k.c >= k.o ? upColor : downColor}
                fillOpacity={0.4}
              />
            )
          })}
        </G>

        {/* Crosshair for the finger-selected candle */}
        {selIdx != null && (
          <G>
            <Line x1={xMid(selIdx)} x2={xMid(selIdx)} y1={0} y2={PLOT_H} stroke={colors.textMuted} strokeWidth={1} strokeDasharray="2 3" />
            <Circle cx={xMid(selIdx)} cy={yPrice(candles[selIdx].c)} r={3.5} fill={colors.text} />
          </G>
        )}
      </Svg>
      </View>

      {/* Loading + sample footnote */}
      <Row justify="space-between" align="center" style={{ marginTop: spacing.sm }}>
        <Text variant="small" tone="subtle">{`${n} days`}</Text>
        <Text variant="small" tone="subtle">NGX · daily</Text>
      </Row>
    </View>
  )
}

const makeStyles = () => StyleSheet.create({
  wrap: {
    marginTop: spacing.md,
  },
})
