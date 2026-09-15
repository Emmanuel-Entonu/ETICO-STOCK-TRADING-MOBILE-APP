// ETICO brand marks, rendered as theme-aware SVG (crisp at any size, exact
// brand colours in both schemes, and a real glow in the dark).
//
//   <EticoMark />   — the three-bar glyph alone. Navbars, spinners, splash.
//   <EticoLogo />   — mark + "ETICO" wordmark. Auth screens, hero states.
//
// Colour rules straight off the two brand lockups:
//   - The MARK is fixed brand: green / GOLD / green, top-to-bottom. The gold
//     centre bar never inverts — on black it GLOWS (see ETICO BLACK). Green
//     recedes to a muted olive in the dark so the gold leads.
//   - The WORDMARK letters are ink: deep green on cream, cream on black. The
//     "I" is always the gold accent — it's the one coloured stroke in the
//     word, matching the logo.

import { View, Image, type ViewStyle } from 'react-native'
import Svg, { Rect, G } from 'react-native-svg'
import { useEffectiveScheme } from '@/theme'

// Real brand lockups (mark + "ETICO" wordmark), exported straight from the
// design file — one green-ink for light, one cream-ink for dark. Using the
// actual artwork (not a hand-drawn wordmark) guarantees exact letterforms and
// spacing. Aspect ratio is the trimmed asset's 700×458.
const LOGO_LIGHT = require('../../assets/brand/etico-logo-light.png')
const LOGO_DARK  = require('../../assets/brand/etico-logo-dark.png')
const LOGO_AR = 700 / 458

// --- fixed brand hues (do NOT pull from the inverting palette tokens) ---
const GREEN_LIGHT = '#3A4429'
const GREEN_DARK  = '#55643B' // muted olive that still reads on near-black
const GOLD        = '#DAA92F'
const GOLD_GLOW   = '#E7BE4A'

export interface EticoMarkProps {
  /** Height in points. The mark is ~square; the logo keeps its ~4.3:1 ratio
   *  off this as the height. */
  size?: number
  /** Force a scheme instead of following the theme. Rare — for placing the
   *  mark on a coloured surface whose luminance differs from the background. */
  variant?: 'auto' | 'light' | 'dark'
  style?: ViewStyle
}

function useScheme(variant: EticoMarkProps['variant']) {
  const themeScheme = useEffectiveScheme()
  if (variant === 'light') return 'light' as const
  if (variant === 'dark') return 'dark' as const
  return themeScheme
}

// ---------------------------------------------------------------- MARK
// Three stacked bars in a 120 × 110 box. Bar height 22, gap 22.
export function EticoMark({ size = 40, variant = 'auto', style }: EticoMarkProps) {
  const scheme = useScheme(variant)
  const dark   = scheme === 'dark'
  const green  = dark ? GREEN_DARK : GREEN_LIGHT
  const gold   = dark ? GOLD_GLOW : GOLD
  const w = size * (120 / 110)

  return (
    <View style={[{ width: w, height: size }, style]}>
      <Svg width={w} height={size} viewBox="0 0 120 110">
        {/* Dark-mode glow: concentric translucent gold behind the centre bar. */}
        {dark && (
          <G>
            <Rect x={-6} y={38} width={132} height={34} rx={17} fill={GOLD} opacity={0.12} />
            <Rect x={-2} y={41} width={124} height={28} rx={12} fill={GOLD} opacity={0.18} />
          </G>
        )}
        <Rect x={0}  y={0}  width={120} height={22} rx={3} fill={green} />
        <Rect x={0}  y={44} width={120} height={22} rx={3} fill={gold} />
        <Rect x={0}  y={88} width={120} height={22} rx={3} fill={green} />
      </Svg>
    </View>
  )
}

// ---------------------------------------------------------------- LOGO
// Mark + "ETICO" wordmark — the real brand artwork as a theme-aware image.
// `size` is the rendered height; width follows the asset's aspect ratio.
export function EticoLogo({ size = 96, variant = 'auto', style }: EticoMarkProps) {
  const scheme = useScheme(variant)
  const src = scheme === 'dark' ? LOGO_DARK : LOGO_LIGHT
  const w = size * LOGO_AR
  return (
    <View style={[{ width: w, height: size }, style]}>
      <Image source={src} style={{ width: w, height: size }} resizeMode="contain" />
    </View>
  )
}
