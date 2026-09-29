import { Pressable, StyleSheet, View, ViewStyle } from 'react-native'
import { Loader } from './Loader'
import { colors, radii, spacing } from '@/theme'
import { Text } from './Text'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'green'
type Size = 'lg' | 'md' | 'sm'

interface Props {
  title: string
  onPress?: () => void
  variant?: Variant
  size?: Size
  loading?: boolean
  disabled?: boolean
  fullWidth?: boolean
  style?: ViewStyle
}

const heightMap: Record<Size, number> = { lg: 56, md: 48, sm: 40 }
const paddingMap: Record<Size, number> = { lg: spacing['2xl'], md: spacing.xl, sm: spacing.lg }
const fontMap: Record<Size, { fontSize: number; fontWeight: '700' | '800' }> = {
  lg: { fontSize: 16, fontWeight: '800' },
  md: { fontSize: 15, fontWeight: '700' },
  sm: { fontSize: 13, fontWeight: '700' },
}

export function Button({
  title, onPress, variant = 'primary', size = 'lg',
  loading, disabled, fullWidth = true, style,
}: Props) {
  const isDisabled = !!disabled || !!loading

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        {
          height: heightMap[size],
          paddingHorizontal: paddingMap[size],
          alignSelf: fullWidth ? 'stretch' : 'center',
        },
        variantStyle(variant, pressed, isDisabled),
        style,
      ]}
    >
      {loading ? (
        // Loading on a button = the breathing ETICO mark (brand loader).
        // Content areas use skeletons instead.
        <Loader size={size === 'sm' ? 26 : size === 'md' ? 32 : 38} />
      ) : (
        <Text
          style={[fontMap[size], { color: textColor(variant, isDisabled) }]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  )
}

function variantStyle(v: Variant, pressed: boolean, disabled: boolean): ViewStyle {
  if (disabled) return { backgroundColor: colors.bgSubtle, borderColor: colors.border }
  switch (v) {
    case 'primary':
      return { backgroundColor: pressed ? colors.brandPress : colors.brand, borderColor: 'transparent' }
    // Only for destructive actions (cancel an order, delete). Real red now —
    // it used to be identical to primary.
    case 'danger':
      return { backgroundColor: colors.negative, borderColor: 'transparent', opacity: pressed ? 0.85 : 1 }
    // The scheme's green (#3FBF6B in dark, deep green in light), used for the
    // Home "Load wallet" / "Invest now" actions (MD, 2026-09-30).
    case 'green':
      return { backgroundColor: colors.positive, borderColor: 'transparent', opacity: pressed ? 0.85 : 1 }
    case 'secondary':
      return { backgroundColor: pressed ? colors.bgMuted : colors.bg, borderColor: colors.borderStrong }
    case 'ghost':
      return { backgroundColor: 'transparent', borderColor: 'transparent' }
  }
}

function textColor(v: Variant, disabled: boolean): string {
  if (disabled) return colors.textSubtle
  if (v === 'danger') return '#FFFFFF'
  // Page background reads on the green in both themes (dark ink / cream).
  if (v === 'green') return colors.bg
  if (v === 'primary') return colors.textOnBrand
  if (v === 'ghost') return colors.brand
  return colors.text
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.lg,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
})
