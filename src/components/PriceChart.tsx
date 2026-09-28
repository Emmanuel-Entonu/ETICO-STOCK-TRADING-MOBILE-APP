import React, { memo, useEffect, useMemo, useRef, useState } from 'react'
import { View, StyleSheet, Dimensions } from 'react-native'
import { MotiView } from 'moti'
import * as Haptics from 'expo-haptics'
import Svg, { Path } from 'react-native-svg'
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
  const first = pts[0]
  const last = pts[n - 1]
  const periodPct = first.c !== 0 ? ((last.c - first.c) / first.c) * 100 : 0
  const periodUp = periodPct >= 0
  const lineColor = periodUp ? colors.positive : colors.negative

  const shown = selIdx != null ? pts[selIdx] : last
  const shownDate = new Date(shown.t).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })

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

      <ScrubChart pts={pts} lo={range.lo} hi={range.hi} W={chartW} H={height} lineColor={lineColor} onSelect={setSelIdx} />

      <Row justify="space-between" align="center" style={{ marginTop: spacing.sm }}>
        <Text variant="small" tone="subtle">Touch and slide to see a day</Text>
        <Text variant="small" tone="subtle">NGX · daily close</Text>
      </Row>
    </View>
  )
}

// Smooth curve through the points without overshoot (monotone cubic,
// Fritsch–Carlson) — reads calmer than straight segments and never draws a
// fake peak/dip between two days.
function smoothPath(xs: number[], ys: number[]): string {
  const n = xs.length
  if (n < 3) return xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ')
  const d: number[] = [], m: number[] = new Array(n)
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]))
  m[0] = d[0]; m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i] }
  }
  let out = `M${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`
  for (let i = 0; i < n - 1; i++) {
    const dx = (xs[i + 1] - xs[i]) / 3
    out += ` C${(xs[i] + dx).toFixed(1)} ${(ys[i] + m[i] * dx).toFixed(1)} ${(xs[i + 1] - dx).toFixed(1)} ${(ys[i + 1] - m[i + 1] * dx).toFixed(1)} ${xs[i + 1].toFixed(1)} ${ys[i + 1].toFixed(1)}`
  }
  return out
}

// The line itself — memoised so scrubbing never re-renders the SVG.
const ChartLines = memo(function ChartLines({ line, area, W, H, color }: { line: string; area: string; W: number; H: number; color: string }) {
  return (
    <Svg width={W} height={H}>
      <Path d={area} fill={color} fillOpacity={0.08} />
      <Path d={line} stroke={color} strokeWidth={2.25} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  )
})

// Scrubbing: the responder grabs the touch immediately (a tap shows that day);
// once the finger moves sideways it locks in and the page can't steal it, while
// a mostly-vertical drag is handed back so the page still scrolls. Only a thin
// crosshair + dot move (plain Views), with a light haptic tick per day crossed.
function ScrubChart({ pts, lo, hi, W, H, lineColor, onSelect }: {
  pts: Candle[]; lo: number; hi: number; W: number; H: number; lineColor: string
  onSelect: (i: number | null) => void
}) {
  const n = pts.length
  const PAD_Y = 10
  const geo = useMemo(() => {
    const xs = pts.map((_, i) => (n === 1 ? W / 2 : (i / (n - 1)) * W))
    const ys = pts.map((p) => PAD_Y + (1 - (p.c - lo) / (hi - lo)) * (H - PAD_Y * 2))
    const line = smoothPath(xs, ys)
    const area = `${line} L${xs[n - 1].toFixed(1)} ${H} L${xs[0].toFixed(1)} ${H} Z`
    return { xs, ys, line, area }
  }, [pts, lo, hi, W, H, n])

  const [idx, setIdx] = useState<number | null>(null)
  const originX = useRef(0)
  const startX = useRef(0)
  const startY = useRef(0)
  const locked = useRef(false)
  const lastIdx = useRef<number | null>(null)
  const boxRef = useRef<View>(null)

  const pick = (pageX: number) => {
    const px = pageX - originX.current
    const i = Math.max(0, Math.min(n - 1, Math.round((px / W) * (n - 1))))
    if (i !== lastIdx.current) {
      lastIdx.current = i
      setIdx(i)
      onSelect(i)
      Haptics.selectionAsync().catch(() => {})
    }
  }
  const clear = () => { lastIdx.current = null; locked.current = false; setIdx(null); onSelect(null) }

  return (
    <View
      ref={boxRef}
      onLayout={() => boxRef.current?.measureInWindow((x) => { originX.current = x })}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => {
        // Re-measure: the page may have scrolled since layout.
        boxRef.current?.measureInWindow((x) => { originX.current = x })
        startX.current = e.nativeEvent.pageX
        startY.current = e.nativeEvent.pageY
        locked.current = false
        pick(e.nativeEvent.pageX)
      }}
      onResponderMove={(e) => {
        const { pageX, pageY } = e.nativeEvent
        if (!locked.current && Math.abs(pageX - startX.current) > 4 && Math.abs(pageX - startX.current) >= Math.abs(pageY - startY.current)) {
          locked.current = true
        }
        pick(pageX)
      }}
      // Keep the gesture once the user is scrubbing sideways.
      onResponderTerminationRequest={() => !locked.current}
      onResponderRelease={clear}
      onResponderTerminate={clear}
      style={{ width: W, height: H }}
    >
      <ChartLines line={geo.line} area={geo.area} W={W} H={H} color={lineColor} />
      {idx != null && (
        <>
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, width: 1, left: geo.xs[idx] - 0.5, backgroundColor: colors.textMuted, opacity: 0.6 }} />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute', width: 12, height: 12, borderRadius: 6,
              left: geo.xs[idx] - 6, top: geo.ys[idx] - 6,
              backgroundColor: lineColor, borderWidth: 2, borderColor: colors.bg,
            }}
          />
        </>
      )}
    </View>
  )
}

const makeStyles = () => StyleSheet.create({
  wrap: {
    marginTop: spacing.md,
  },
})
