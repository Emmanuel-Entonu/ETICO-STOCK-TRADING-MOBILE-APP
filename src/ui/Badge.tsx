import { View } from 'react-native'
import { colors, radii, spacing } from '@/theme'
import { Text } from './Text'

type Tone = 'default' | 'positive' | 'negative' | 'warning' | 'brand'

const bg: Record<Tone, string> = {
  default:  colors.bgSubtle,
  positive: colors.positiveSubtle,
  negative: colors.negativeSubtle,
  warning:  colors.warningSubtle,
  brand:    colors.brandSubtle,
}
const fg: Record<Tone, string> = {
  default:  colors.text,
  positive: colors.positive,
  negative: colors.negative,
  warning:  colors.warning,
  brand:    colors.brand,
}

export function Badge({ label, tone = 'default' }: { label: string; tone?: Tone }) {
  return (
    <View
      style={{
        backgroundColor: bg[tone],
        borderRadius: radii.pill,
        paddingHorizontal: spacing.md,
        paddingVertical: 4,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ color: fg[tone], fontSize: 11, fontWeight: '800', letterSpacing: 0.4 }}>{label}</Text>
    </View>
  )
}
