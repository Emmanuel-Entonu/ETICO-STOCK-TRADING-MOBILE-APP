import { ReactNode } from 'react'
import { ScrollView, StyleSheet, View, ViewStyle, RefreshControl } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, spacing, useThemedStyles } from '@/theme'

interface Props {
  children: ReactNode
  scroll?: boolean
  padded?: boolean
  refreshing?: boolean
  onRefresh?: () => void
  edges?: ('top' | 'bottom' | 'left' | 'right')[]
  style?: ViewStyle
  contentStyle?: ViewStyle
}

export function Screen({
  children,
  scroll = false,
  padded = true,
  refreshing,
  onRefresh,
  edges = ['top', 'left', 'right'],
  style,
  contentStyle,
}: Props) {
  const styles = useThemedStyles(makeStyles)
  const insets = useSafeAreaInsets()
  const contentInner: ViewStyle = {
    paddingHorizontal: padded ? spacing.xl : 0,
    paddingBottom: spacing['3xl'] + insets.bottom,
    ...contentStyle,
  }
  if (scroll) {
    return (
      <SafeAreaView edges={edges} style={[styles.root, style]}>
        <ScrollView
          contentContainerStyle={contentInner}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.brand} /> : undefined}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    )
  }
  return (
    <SafeAreaView edges={edges} style={[styles.root, style]}>
      <View style={[styles.body, contentInner]}>{children}</View>
    </SafeAreaView>
  )
}

const makeStyles = () => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
})
