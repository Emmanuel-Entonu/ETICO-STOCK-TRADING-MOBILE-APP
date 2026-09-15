import { View } from 'react-native'
import { colors, spacing } from '@/theme'

export function Divider({ vertical, my = 'md' }: { vertical?: boolean; my?: keyof typeof spacing }) {
  if (vertical) return <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: colors.border }} />
  return <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing[my] }} />
}
