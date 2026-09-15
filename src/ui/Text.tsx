import { Text as RNText, TextProps, StyleSheet } from 'react-native'
import { colors, typography } from '@/theme'

type Variant = keyof typeof typography
type Tone = 'default' | 'muted' | 'subtle' | 'inverse' | 'brand' | 'accent' | 'positive' | 'negative'

interface Props extends TextProps {
  variant?: Variant
  tone?: Tone
  align?: 'left' | 'center' | 'right'
}

// Read from the `colors` Proxy at call time — do NOT lift this to module scope,
// or every <Text> in the app freezes with the palette that happened to be
// active at module load (this was the reason dark-mode text stayed dark).
function toneColor(tone: Tone): string {
  switch (tone) {
    case 'muted':    return colors.textMuted
    case 'subtle':   return colors.textSubtle
    case 'inverse':  return colors.textInverse
    case 'brand':    return colors.brand
    case 'accent':   return colors.accent
    case 'positive': return colors.positive
    case 'negative': return colors.negative
    default:         return colors.text
  }
}

export function Text({ variant = 'body', tone = 'default', align, style, ...rest }: Props) {
  return (
    <RNText
      style={[
        typography[variant],
        { color: toneColor(tone) },
        align ? { textAlign: align } : null,
        style,
      ]}
      {...rest}
    />
  )
}

// Prevents accidental use of raw <Text> without theme
StyleSheet.compose // eslint-disable-line
