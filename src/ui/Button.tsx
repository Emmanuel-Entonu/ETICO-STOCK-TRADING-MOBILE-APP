import { Pressable, StyleSheet, View, ViewStyle } from 'react-native'
import { MotiView } from 'moti'
import { colors, radii, spacing } from '@/theme'
import { Text } from './Text'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
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
        // Skeleton-style loading: the button label becomes a pulsing bar
        // instead of a rotating spinner. Consistent with the rest of the
        // app's "if it's loading, show a skeleton" pattern.
        <MotiView
          from={{ opacity: 0.35 }}
          animate={{ opacity: 0.75 }}
          transition={{ type: 'timing', duration: 700, loop: true, repeatReverse: true }}
          style={{
            height: fontMap[size].fontSize + 2,
            width: '55%',
            borderRadius: 999,
            backgroundColor: variant === 'primary' || variant === 'danger'
              ? 'rgba(255,255,255,0.45)'
              : colors.bgSubtle,
          }}
        />
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
    case 'secondary':
      return { backgroundColor: pressed ? colors.bgMuted : colors.bg, borderColor: colors.borderStrong }
    case 'ghost':
      return { backgroundColor: 'transparent', borderColor: 'transparent' }
  }
}

function textColor(v: Variant, disabled: boolean): string {
  if (disabled) return colors.textSubtle
  if (v === 'danger') return '#FFFFFF'
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
