import { View, Pressable, StyleSheet } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import Svg, { Path, Defs, LinearGradient as SvgGrad, Stop } from 'react-native-svg'
import { MotiView } from 'moti'
import { Text, Icon } from '@/ui'
import { spacing, radii, useEffectiveScheme } from '@/theme'
import { EticoLogo } from '@/components/EticoMark'

// Entry / onboarding screen — a faithful clone of the brand welcome design:
// centered ETICO lockup + tagline over layered green topographic hills, a gold
// "Get Started" CTA, and a "Log In" link. Theme-aware (dark + light).
export default function WelcomeScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const dark = useEffectiveScheme() === 'dark'

  const bg      = dark ? '#0B0D0A' : '#FDFCFA'
  const tagline = dark ? '#8A9586' : '#6C7358'
  const linkCol = dark ? '#EAEDE7' : '#2C3420'
  const hill    = dark ? '#2E3A28' : '#3A4429'
  const o1 = dark ? 0.9 : 0.16   // front hill opacity
  const o2 = dark ? 0.55 : 0.10  // back hill opacity

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      {/* Smooth layered green dunes sweeping diagonally through the mid-lower
          area, with a soft highlight where ridges overlap, matches the guide. */}
      <View style={styles.hills} pointerEvents="none">
        <Svg width="100%" height="100%" viewBox="0 0 400 460" preserveAspectRatio="xMidYMax slice">
          <Defs>
            <SvgGrad id="duneBack" x1="0" y1="0" x2="0.4" y2="1">
              <Stop offset="0" stopColor={hill} stopOpacity={dark ? 0.45 : 0.10} />
              <Stop offset="1" stopColor={hill} stopOpacity={dark ? 0.10 : 0.02} />
            </SvgGrad>
            <SvgGrad id="duneMid" x1="0" y1="0" x2="0.5" y2="1">
              <Stop offset="0" stopColor={hill} stopOpacity={dark ? 0.75 : 0.16} />
              <Stop offset="1" stopColor={hill} stopOpacity={dark ? 0.18 : 0.04} />
            </SvgGrad>
            <SvgGrad id="duneFront" x1="0.2" y1="0" x2="0.8" y2="1">
              <Stop offset="0" stopColor={dark ? '#3B4A31' : '#3A4429'} stopOpacity={dark ? 0.95 : 0.20} />
              <Stop offset="1" stopColor={hill} stopOpacity={dark ? 0.30 : 0.06} />
            </SvgGrad>
            <SvgGrad id="duneEdge" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={dark ? '#5C7048' : '#5C6B3D'} stopOpacity={dark ? 0.5 : 0.14} />
              <Stop offset="1" stopColor={hill} stopOpacity="0" />
            </SvgGrad>
          </Defs>

          {/* Full-width undulating dunes — each crests on the LEFT and RIGHT
              with a valley between, layered back-to-front. */}
          {/* back ridge */}
          <Path d="M-20,150 C70,100 160,150 240,140 C330,128 380,180 460,140 L460,460 L-20,460 Z" fill="url(#duneBack)" />
          {/* mid ridge */}
          <Path d="M-20,250 C80,180 170,250 250,230 C340,208 400,270 460,235 L460,460 L-20,460 Z" fill="url(#duneMid)" />
          {/* front ridge — the prominent dune */}
          <Path d="M-20,350 C90,280 180,350 270,320 C360,292 410,350 460,320 L460,460 L-20,460 Z" fill="url(#duneFront)" />
          {/* soft highlight along the front ridge crest (full width) */}
          <Path d="M-20,350 C90,280 180,350 270,320 C360,292 410,350 460,320" stroke="url(#duneEdge)" strokeWidth="2" fill="none" />
        </Svg>
      </View>

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl }}>
          <MotiView
            from={{ opacity: 0, translateY: 10 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 500 }}
            style={{ alignItems: 'center', marginTop: -spacing['3xl'] }}
          >
            <EticoLogo size={132} variant={dark ? 'dark' : 'light'} />
            <Text align="center" style={{ marginTop: spacing.xl, fontSize: 15, lineHeight: 23, fontWeight: '500', color: tagline }}>
              Trade with purpose.{'\n'}Invest for a better tomorrow.
            </Text>
          </MotiView>
        </View>

        <View style={{ paddingHorizontal: spacing.xl, paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.md }}>
          <Pressable
            onPress={() => router.push('/(auth)/register' as never)}
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}
          >
            <Text style={styles.ctaLabel}>Get Started</Text>
            <Icon name="solar:arrow-right-linear" size={18} color="#0B0D0A" />
          </Pressable>

          <Pressable
            onPress={() => router.push('/(auth)/login' as never)}
            hitSlop={12}
            style={{ alignSelf: 'center', paddingVertical: spacing.md, marginTop: spacing.xs }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: linkCol }}>Log In</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  hills: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '58%',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: '#D4AF37',   // signature gold CTA in both themes
  },
  ctaLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0B0D0A',
    letterSpacing: -0.2,
  },
})
