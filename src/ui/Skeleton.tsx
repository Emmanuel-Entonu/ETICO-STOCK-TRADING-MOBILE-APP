import { useEffect } from 'react'
import { View, type ViewStyle, type DimensionValue } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, cancelAnimation } from 'react-native-reanimated'
import { colors, spacing, radii } from '@/theme'

// Skeleton loaders: grey placeholder shapes laid out like the content that's
// coming, pulsing gently. Use these whenever CONTENT is loading (lists, cards,
// detail pages). Buttons use the ETICO logo animation instead (see Button).
//
// The pulse runs on the UI thread (Reanimated), so skeletons stay smooth while
// the JS thread is busy fetching / parsing.

export function Skeleton({ width = '100%', height = 14, radius = radii.sm, style }: {
  width?: DimensionValue
  height?: number
  radius?: number
  style?: ViewStyle
}) {
  const o = useSharedValue(0.45)
  useEffect(() => {
    o.value = withRepeat(withTiming(0.9, { duration: 750, easing: Easing.inOut(Easing.quad) }), -1, true)
    return () => cancelAnimation(o)
  }, [o])
  const anim = useAnimatedStyle(() => ({ opacity: o.value }))
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: colors.bgSubtle }, anim, style]} />
}

/** A list row: round avatar, two text lines, and a right-aligned value. */
export function SkeletonRow({ avatar = true }: { avatar?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md }}>
      {avatar ? <Skeleton width={40} height={40} radius={20} /> : null}
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="45%" height={14} />
        <Skeleton width="70%" height={11} />
      </View>
      <View style={{ alignItems: 'flex-end', gap: 8 }}>
        <Skeleton width={64} height={14} />
        <Skeleton width={40} height={11} />
      </View>
    </View>
  )
}

/** A stack of list rows with hairline dividers. */
export function SkeletonList({ rows = 6, avatar = true, style }: { rows?: number; avatar?: boolean; style?: ViewStyle }) {
  return (
    <View style={[{ paddingHorizontal: spacing.xl }, style]}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
          <SkeletonRow avatar={avatar} />
        </View>
      ))}
    </View>
  )
}
