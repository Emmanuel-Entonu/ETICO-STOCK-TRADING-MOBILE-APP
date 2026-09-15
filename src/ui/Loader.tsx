// Branded loading indicator. Uses the ETICO mark with a soft breathing
// animation (scale 0.9 → 1.05 → 0.9, opacity 0.6 → 1 → 0.6) driven off the
// UI thread via reanimated. Feels like the brand is "alive" while data
// loads — no spinning platform wheel, no generic dots.

import { useEffect } from 'react'
import { View, StyleSheet, type ViewStyle } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated'
import { EticoMark } from '@/components/EticoMark'
import { Text } from './Text'

export interface LoaderProps {
  /** Overall footprint. The mark itself sits at ~72% of this so there's
   *  a bit of headroom for the breathing animation. */
  size?:  number
  /** Optional muted caption underneath. */
  label?: string
  style?: ViewStyle
}

export function Loader({ size = 40, label, style }: LoaderProps) {
  const scale   = useSharedValue(0.9)
  const opacity = useSharedValue(0.6)

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.9,  { duration: 700, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    )
    opacity.value = withRepeat(
      withSequence(
        withTiming(1,   { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.6, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    )
    return () => {
      cancelAnimation(scale)
      cancelAnimation(opacity)
    }
  }, [scale, opacity])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }))

  const markSize = Math.round(size * 0.72)

  return (
    <View style={[styles.wrap, { minWidth: size, minHeight: size }, style]}>
      <Animated.View style={animStyle}>
        <EticoMark size={markSize} />
      </Animated.View>
      {label && (
        <Text variant="small" tone="muted" style={{ marginTop: 14 }}>{label}</Text>
      )}
    </View>
  )
}

/** Full-screen centered loader for page-level suspense. */
export function LoaderScreen({ label }: { label?: string }) {
  return (
    <View style={styles.screen}>
      <Loader size={56} label={label} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
})
