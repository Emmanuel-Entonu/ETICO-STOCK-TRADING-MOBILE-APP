import { ReactNode } from 'react'
import { View, ViewStyle } from 'react-native'
import { spacing } from '@/theme'

interface Props {
  children: ReactNode
  gap?: keyof typeof spacing
  align?: 'flex-start' | 'center' | 'flex-end' | 'baseline'
  justify?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around'
  wrap?: boolean
  style?: ViewStyle
}

export function Row({ children, gap = 'md', align = 'center', justify = 'flex-start', wrap = false, style }: Props) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: align,
          justifyContent: justify,
          gap: spacing[gap],
          flexWrap: wrap ? 'wrap' : 'nowrap',
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}

interface StackProps {
  children: ReactNode
  gap?: keyof typeof spacing
  style?: ViewStyle
}

export function Stack({ children, gap = 'md', style }: StackProps) {
  return <View style={[{ gap: spacing[gap] }, style]}>{children}</View>
}
