import { ReactNode } from 'react'
import { View, ViewStyle, Pressable, StyleSheet } from 'react-native'
import { colors, radii, spacing, useThemedStyles } from '@/theme'

interface Props {
  children: ReactNode
  onPress?: () => void
  padded?: boolean
  border?: boolean
  style?: ViewStyle
}

export function Card({ children, onPress, padded = true, border = true, style }: Props) {
  const styles = useThemedStyles(makeStyles)
  const base: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: border ? 1 : 0,
    borderColor: colors.border,
    padding: padded ? spacing.xl : 0,
  }
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [base, pressed && styles.pressed, style]}
      >
        {children}
      </Pressable>
    )
  }
  return <View style={[base, style]}>{children}</View>
}

const makeStyles = () => StyleSheet.create({
  pressed: { backgroundColor: colors.bgMuted },
})
