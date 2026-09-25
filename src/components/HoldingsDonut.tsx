import React, { useMemo } from 'react'
import { View, StyleSheet } from 'react-native'
import Svg, { Path, Defs, RadialGradient, Stop, LinearGradient, G, Ellipse } from 'react-native-svg'
import { Text } from '@/ui'
import { colors, spacing } from '@/theme'
import { naira } from '@/lib/format'

/**
 * Isometric-projected donut showing portfolio composition.
 * Each slice is a holding, sized by market value, shaded with a radial
 * gradient for a subtle 3D "lift" without pulling in Three.js.
 * A duplicated darker donut sits offset below the top face as the
 * "rim" of the disc.
 */

const SLICE_PALETTE = [
  ['#3A4429', '#2C3420'], // brand green
  ['#DAA92F', '#C0921F'], // brand gold
  ['#0E9F6E', '#0B7A55'],
  ['#3B82F6', '#1D4ED8'],
  ['#F59E0B', '#B45309'],
  ['#8B5CF6', '#6D28D9'],
  ['#EC4899', '#BE185D'],
  ['#14B8A6', '#0F766E'],
  ['#F97316', '#C2410C'],
] as const

function colorFor(index: number): readonly [string, string] {
  return SLICE_PALETTE[index % SLICE_PALETTE.length]
}

// SVG arc-path helper.
function arcPath(cx: number, cy: number, rOuter: number, rInner: number, startAngle: number, endAngle: number): string {
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0
  const x1 = cx + rOuter * Math.cos(startAngle)
  const y1 = cy + rOuter * Math.sin(startAngle)
  const x2 = cx + rOuter * Math.cos(endAngle)
  const y2 = cy + rOuter * Math.sin(endAngle)
  const x3 = cx + rInner * Math.cos(endAngle)
  const y3 = cy + rInner * Math.sin(endAngle)
  const x4 = cx + rInner * Math.cos(startAngle)
  const y4 = cy + rInner * Math.sin(startAngle)
  return [
    `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    `L ${x3.toFixed(2)} ${y3.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}`,
    'Z',
  ].join(' ')
}

export interface HoldingSlice {
  symbol: string
  value:  number
  pnlPct: number
}

interface Props {
  holdings: HoldingSlice[]
  totalValue: number
  totalPnL:   number
  totalPnLPct: number
  size?: number
}

export function HoldingsDonut({ holdings, totalValue, totalPnL, totalPnLPct, size = 260 }: Props) {
  const cx = size / 2
  const cy = size / 2
  const rOuter = size * 0.42
  const rInner = size * 0.26

  const slices = useMemo(() => {
    if (holdings.length === 0) return []
    const total = holdings.reduce((s, h) => s + h.value, 0) || 1
    let angle = -Math.PI / 2 // start at 12 o'clock
    return holdings.slice(0, 8).map((h, i) => {
      const sweep = (h.value / total) * Math.PI * 2
      const startAngle = angle
      const endAngle = angle + sweep
      angle = endAngle
      const [top, side] = colorFor(i)
      const midAngle = (startAngle + endAngle) / 2
      // Radial-gradient focal point for a "glossy" highlight per slice.
      const focalX = cx + Math.cos(midAngle - 0.6) * rOuter * 0.35
      const focalY = cy + Math.sin(midAngle - 0.6) * rOuter * 0.35
      return {
        key: `${h.symbol}-${i}`,
        symbol: h.symbol,
        pct: h.value / total,
        topPath: arcPath(cx, cy, rOuter, rInner, startAngle, endAngle),
        color: top,
        sideColor: side,
        focalX,
        focalY,
      }
    })
  }, [holdings, cx, cy, rOuter, rInner])

  const isUp = totalPnL >= 0
  const empty = slices.length === 0
  // Y-tilt for the isometric feel.
  const tiltY = 0.72
  const liftY = 12

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size} style={{ overflow: 'visible' }}>
        <Defs>
          {slices.map(s => (
            <RadialGradient
              key={s.key}
              id={`grad-${s.key}`}
              cx={s.focalX}
              cy={s.focalY}
              rx={rOuter * 0.9}
              ry={rOuter * 0.9}
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset="0"    stopColor="#FFFFFF" stopOpacity={0.35} />
              <Stop offset="0.35" stopColor={s.color} stopOpacity={1} />
              <Stop offset="1"    stopColor={s.sideColor} stopOpacity={1} />
            </RadialGradient>
          ))}
          <LinearGradient id="shadow-fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000000" stopOpacity={0.35} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {/* Ambient shadow beneath the disc — gives the whole shape lift */}
        <Ellipse
          cx={cx}
          cy={cy + rOuter * tiltY + 6}
          rx={rOuter * 0.95}
          ry={rOuter * 0.18}
          fill="url(#shadow-fade)"
        />

        {/* "Rim" — same donut, offset down, darker */}
        <G transform={`translate(0 ${liftY}) scale(1 ${tiltY}) translate(0 ${cy - cy * (1 / tiltY)})`}>
          {empty ? (
            <Path
              d={arcPath(cx, cy, rOuter, rInner, 0, Math.PI * 2 - 0.001)}
              fill={colors.borderStrong}
              opacity={0.6}
            />
          ) : (
            slices.map(s => (
              <Path key={`${s.key}-side`} d={s.topPath} fill={s.sideColor} opacity={0.9} />
            ))
          )}
        </G>

        {/* Top face — tilted for the iso feel */}
        <G transform={`scale(1 ${tiltY}) translate(0 ${cy - cy * (1 / tiltY)})`}>
          {empty ? (
            <Path
              d={arcPath(cx, cy, rOuter, rInner, 0, Math.PI * 2 - 0.001)}
              fill={colors.bgSubtle}
              stroke={colors.border}
              strokeWidth={1}
            />
          ) : (
            slices.map(s => (
              <Path
                key={`${s.key}-top`}
                d={s.topPath}
                fill={`url(#grad-${s.key})`}
              />
            ))
          )}
        </G>
      </Svg>

      {/* Center readout — absolute-positioned over the donut hole */}
      <View style={[styles.center, { width: size, height: size, top: 0 }]}>
        <Text style={styles.centerLabel}>PORTFOLIO</Text>
        <Text style={styles.centerValue}>{naira(totalValue)}</Text>
        <View style={styles.pnlPill}>
          <Text style={{ color: isUp ? colors.positive : colors.negative, fontSize: 11, fontWeight: '800' }}>
            {isUp ? '+' : ''}{totalPnLPct.toFixed(2)}%
          </Text>
        </View>
      </View>

      {/* Legend */}
      {slices.length > 0 && (
        <View style={styles.legend}>
          {slices.map(s => (
            <View key={s.key} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: s.color }]} />
              <Text style={styles.legendSymbol}>{s.symbol}</Text>
              <Text style={styles.legendPct}>{(s.pct * 100).toFixed(0)}%</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  centerLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  centerValue: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -0.5,
  },
  pnlPill: {
    marginTop: 6,
  },
  legend: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendSymbol: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 0.2,
  },
  legendPct: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
})
