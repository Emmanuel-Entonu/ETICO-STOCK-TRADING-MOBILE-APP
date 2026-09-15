import { useState, type ReactNode } from 'react'
import { View, useWindowDimensions } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { spacing } from '@/theme'

// Brand hero with a sweeping convex bottom curve (dips down in the centre),
// drawn as an SVG path — borderRadius can only round corners, not bulge.
// Fixed green in both modes: it's a brand panel, like the logo on cream.
const HERO = '#3A4429'
const CURVE = 52 // how far the centre dips below the side edges

export function CurvedHero({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const [contentH, setContentH] = useState(220)
  const heroH = contentH + spacing.lg

  return (
    <View style={{ height: heroH + CURVE }}>
      <Svg width={width} height={heroH + CURVE} style={{ position: 'absolute', top: 0, left: 0 }}>
        <Path
          d={`M0 0 H${width} V${heroH} Q${width / 2} ${heroH + CURVE} 0 ${heroH} Z`}
          fill={HERO}
        />
      </Svg>
      <View
        onLayout={(e) => setContentH(e.nativeEvent.layout.height)}
        style={{ paddingTop: insets.top + spacing.xl, paddingHorizontal: spacing['2xl'] }}
      >
        {children}
      </View>
    </View>
  )
}
