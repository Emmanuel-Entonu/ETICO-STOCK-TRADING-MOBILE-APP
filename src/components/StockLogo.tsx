import { useState } from 'react'
import { View, Image, Platform, StyleSheet } from 'react-native'
import { Text } from '@/ui'
import { config } from '@/lib/config'
import { LOCAL_LOGOS } from '@/lib/localLogos'

// ─────────────────────────────────────────────────────────────
// StockLogo — points at the Vercel proxy's `/api/logo/{symbol}` endpoint.
//
// The proxy runs the multi-source cascade (logo.dev → clearbit →
// apple-touch-icon → Google favicon → generated SVG chip), caches at the
// CDN edge for 24 hours, and always returns an image response. That means
// every install shares one canonical logo per ticker — no per-user
// client-side URL cycling, no AsyncStorage cache, no icon.horse round
// trips. RN's built-in `<Image>` cache handles per-device dedup.
//
// If the proxy call itself fails (offline, DNS), we fall through to the
// initials badge below so the list still paints.
// ─────────────────────────────────────────────────────────────

const PALETTE = [
  ['#0F172A', '#1E293B'],
  ['#164E63', '#0E7490'],
  ['#065F46', '#047857'],
  ['#7C2D12', '#9A3412'],
  ['#4A044E', '#701A75'],
  ['#1E3A8A', '#2563EB'],
  ['#134E4A', '#0F766E'],
  ['#3F3F46', '#52525B'],
  ['#312E81', '#4338CA'],
  ['#7F1D1D', '#B91C1C'],
] as const

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}
function paletteFor(symbol: string): readonly [string, string] {
  return PALETTE[hashCode(symbol) % PALETTE.length]
}
function initialsOf(symbol: string): string {
  return symbol.slice(0, 3).toUpperCase()
}

interface Props {
  symbol: string
  size?:  number
}

export function StockLogo({ symbol, size = 40 }: Props) {
  const [failed, setFailed] = useState(false)
  // Hand-curated bundled logo first (instant, offline, best quality); otherwise
  // the proxy's remote cascade.
  const local = LOCAL_LOGOS[symbol.toUpperCase()]
  const source = local ?? { uri: `${config.proxyBase}/api/logo?symbol=${encodeURIComponent(symbol.toUpperCase())}` }

  if (failed) return <FallbackBadge symbol={symbol} size={size} />

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        backgroundColor: '#FFFFFF',
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Image
        source={source}
        style={{ width: size - 4, height: size - 4 }}
        resizeMode="contain"
        onError={() => setFailed(true)}
      />
    </View>
  )
}

// Kept for cases where the proxy round-trip fails entirely (offline).
function FallbackBadge({ symbol, size }: { symbol: string; size: number }) {
  const [dark, light] = paletteFor(symbol)
  const fontSize = Math.max(11, Math.round(size * 0.34))
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        overflow: 'hidden',
        backgroundColor: dark,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          ...StyleSheet.absoluteFill,
          backgroundColor: light,
          opacity: 0.55,
          transform: [{ translateY: -size * 0.5 }, { scaleY: 0.6 }],
        }}
      />
      <Text
        style={{
          color: '#FFFFFF',
          fontWeight: '900',
          fontSize,
          letterSpacing: Platform.OS === 'ios' ? 0.3 : 0.5,
        }}
      >
        {initialsOf(symbol)}
      </Text>
    </View>
  )
}
