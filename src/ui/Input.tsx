import { useState } from 'react'
import {
  TextInput, TextInputProps, View, StyleSheet, ViewStyle, Pressable,
} from 'react-native'
import { colors, radii, spacing, typography, useThemedStyles } from '@/theme'
import { Text } from './Text'

interface Props extends TextInputProps {
  label?: string
  error?: string | null
  hint?: string
  trailing?: React.ReactNode
  containerStyle?: ViewStyle
}

export function Input({ label, error, hint, trailing, containerStyle, style, onFocus, onBlur, ...rest }: Props) {
  const styles = useThemedStyles(makeStyles)
  const [focused, setFocused] = useState(false)

  const borderColor = error
    ? colors.negative
    : focused
      ? colors.text
      : colors.border

  return (
    <View style={[{ marginBottom: spacing.lg }, containerStyle]}>
      {label && (
        <Text variant="eyebrow" tone="muted" style={{ marginBottom: spacing.sm }}>
          {label}
        </Text>
      )}
      <View style={[styles.field, { borderColor }]}>
        <TextInput
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.brand}
          style={[styles.input, style]}
          onFocus={(e) => { setFocused(true); onFocus?.(e) }}
          onBlur={(e) => { setFocused(false); onBlur?.(e) }}
          {...rest}
        />
        {trailing}
      </View>
      {(error || hint) && (
        <Text variant="small" tone={error ? 'negative' : 'muted'} style={{ marginTop: spacing.xs }}>
          {error ?? hint}
        </Text>
      )}
    </View>
  )
}

// Segmented control-like radio row (used for ID type, order type, etc.)
export function OptionGroup<T extends string>({
  options, value, onChange, columns = 2,
}: {
  options: { value: T; label: string }[]
  value: T | null
  onChange: (v: T) => void
  columns?: 1 | 2 | 3 | 4
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {options.map((opt) => {
        const selected = opt.value === value
        const flexBasis = columns === 1 ? '100%' : `${(100 / columns) - 2}%`
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={{
              flexBasis: flexBasis as `${number}%`,
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.lg,
              borderRadius: radii.md,
              borderWidth: 1.5,
              borderColor: selected ? colors.text : colors.border,
              backgroundColor: selected ? colors.text : colors.bg,
              alignItems: 'center',
            }}
          >
            <Text
              variant="bodyStrong"
              style={{ color: selected ? colors.textInverse : colors.text, fontSize: 13 }}
            >
              {opt.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const makeStyles = () => StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
  },
  input: {
    flex: 1,
    ...typography.bodyStrong,
    color: colors.text,
    paddingVertical: spacing.md,
  },
})
