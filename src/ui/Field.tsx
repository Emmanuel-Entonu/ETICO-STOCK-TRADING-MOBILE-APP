import { useState } from 'react'
import { View, TextInput, type TextInputProps, type ViewStyle } from 'react-native'
import { colors, spacing } from '@/theme'
import { Text } from './Text'

// Underline field — the ETICO input language (big type, hairline baseline that
// lifts to gold on focus). Deliberately NOT the boxed `Input`; used across the
// auth + KYC flows so they read as one system.
interface FieldProps extends TextInputProps {
  label?: string
  error?: string | null
  trailing?: React.ReactNode
  /** Larger type + tracking, for hero inputs (BVN, ID number). */
  big?: boolean
  containerStyle?: ViewStyle
}

export function Field({
  label, error, trailing, big, containerStyle, onFocus, onBlur, style, ...rest
}: FieldProps) {
  const [focused, setFocused] = useState(false)
  const borderColor = error ? colors.negative : focused ? colors.accent : colors.borderStrong
  return (
    <View style={[{ marginBottom: spacing['2xl'] }, containerStyle]}>
      {label ? (
        <Text variant="eyebrow" tone="muted" style={{ marginBottom: spacing.md }}>{label}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: borderColor, paddingBottom: spacing.sm }}>
        <TextInput
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.accent}
          onFocus={(e) => { setFocused(true); onFocus?.(e) }}
          onBlur={(e) => { setFocused(false); onBlur?.(e) }}
          style={[{ flex: 1, fontSize: big ? 22 : 18, fontWeight: '600', color: colors.text, padding: 0, letterSpacing: big ? 1 : 0 }, style]}
          {...rest}
        />
        {trailing ? <View style={{ marginLeft: spacing.md }}>{trailing}</View> : null}
      </View>
      {error ? <Text variant="small" tone="negative" style={{ marginTop: spacing.sm }}>{error}</Text> : null}
    </View>
  )
}
