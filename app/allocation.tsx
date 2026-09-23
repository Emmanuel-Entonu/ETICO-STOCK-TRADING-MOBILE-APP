import { useEffect, useMemo, useState } from 'react'
import { View, StyleSheet, Pressable, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { MotiView } from 'moti'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  
  Easing,
  cancelAnimation,
} from 'react-native-reanimated'
import { PieChart } from 'react-native-gifted-charts'
import { usePortfolioStore } from '@/store/portfolioStore'
import { useAuthStore } from '@/store/authStore'
import { usePinStore } from '@/store/pinStore'
import { Text, Icon } from '@/ui'
import { colors, spacing, radii, useThemedStyles } from '@/theme'
import { naira } from '@/lib/format'
import { useShallow } from 'zustand/react/shallow'

const SLICE_PALETTE = ['#3A4429', '#DAA92F', '#3B82F6', '#0E9F6E', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316']

export default function AllocationScreen() {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const { positions } = usePortfolioStore(useShallow((s) => ({ positions: s.positions })))
  const { user, walletBalance } = useAuthStore(useShallow((s) => ({ user: s.user, walletBalance: s.walletBalance })))
  const unlocked = usePinStore(s => s.unlockedThisSession)
  const account = usePortfolioStore((s) => s.account)

  // Deep-link hardening — the route sits at root (modal presentation), so
  // AuthGate's redirect only runs post-mount. Render nothing until we know
  // the user is authed AND has unlocked the PIN this session; otherwise a
  // deep link (`moneta:///allocation`) would flash cached positions.
  if (!user || !unlocked) return null

  const totalMarketValue = positions.reduce((s, p) => s + p.marketValue, 0)
  const cashBalance = account?.balance ?? walletBalance
  const netWorth = totalMarketValue + cashBalance

  const segments = useMemo(() => {
    const nonZero = positions.filter(p => p.marketValue > 0)
    const total = nonZero.reduce((s, p) => s + p.marketValue, 0)
    if (total <= 0) return []
    const sorted = [...nonZero].sort((a, b) => b.marketValue - a.marketValue)
    const shown = sorted.slice(0, 6)
    const restVal = sorted.slice(6).reduce((s, p) => s + p.marketValue, 0)
    return [
      ...shown.map((p, i) => ({
        symbol: p.symbol,
        value: p.marketValue,
        pct: p.marketValue / total,
        color: SLICE_PALETTE[i % SLICE_PALETTE.length],
      })),
      ...(restVal > 0
        ? [{ symbol: 'Other', value: restVal, pct: restVal / total, color: colors.textSubtle }]
        : []),
    ]
  }, [positions])

  const pieData = useMemo(
    () => segments.map((s) => ({ value: s.pct * 100, color: s.color })),
    [segments]
  )

  // "Calculating…" loader — spins for ~1200ms so the reveal reads as a real
  // computation, not just a render trick. Then the donut fades/scales in.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1200)
    return () => clearTimeout(t)
  }, [])

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
          <Icon name="solar:alt-arrow-left-linear" size={22} color={colors.text} />
        </Pressable>
        <Text variant="h2">Allocation</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing['4xl'] }}
        showsVerticalScrollIndicator={false}
      >
        {/* Eyebrow only — the big number lives inside the donut so there's
            no vertical stack fight between the header value and the chart. */}
        <MotiView
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 320 }}
          style={{ alignItems: 'center', marginTop: spacing.lg }}
        >
          <Text variant="eyebrow" tone="muted">PORTFOLIO SPLIT</Text>
        </MotiView>

        <View style={styles.chartWrap}>
          {!ready ? (
            <CalculatingLoader />
          ) : pieData.length === 0 ? (
            <MotiView
              from={{ opacity: 0, translateY: 8 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 260 }}
              style={{ alignItems: 'center', paddingVertical: spacing['3xl'] }}
            >
              <Icon name="solar:pie-chart-2-linear" size={48} color={colors.textSubtle} />
              <Text variant="bodyStrong" tone="muted" style={{ marginTop: spacing.md }}>Nothing to show yet</Text>
              <Text variant="small" tone="subtle" align="center" style={{ marginTop: spacing.xs, maxWidth: 260 }}>
                Buy your first stock and your portfolio breakdown will appear here.
              </Text>
            </MotiView>
          ) : (
            <MotiView
              from={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', damping: 14, stiffness: 180, mass: 0.9 }}
            >
              <PieChart
                donut
                data={pieData}
                radius={110}
                innerRadius={82}
                innerCircleColor={colors.bg}
                focusOnPress
                sectionAutoFocus
                centerLabelComponent={() => (
                  <View style={{ alignItems: 'center', paddingHorizontal: 4 }}>
                    <Text style={styles.centerLabel}>PORTFOLIO</Text>
                    <Text style={styles.centerVal} numberOfLines={1} adjustsFontSizeToFit>
                      {naira(netWorth)}
                    </Text>
                  </View>
                )}
              />
            </MotiView>
          )}
        </View>

        {/* Subtitle sits below the donut, cleanly separated */}
        {ready && (
          <MotiView
            from={{ opacity: 0, translateY: 6 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 320, delay: 200 }}
            style={{ alignItems: 'center', marginTop: spacing.lg }}
          >
            <Text variant="small" tone="muted">
              {positions.length} position{positions.length === 1 ? '' : 's'} · {naira(cashBalance)} cash
            </Text>
          </MotiView>
        )}

        {ready && segments.length > 0 && (
          <MotiView
            from={{ opacity: 0, translateY: 12 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 340, delay: 260 }}
            style={styles.legendCard}
          >
            <Text variant="eyebrow" tone="muted" style={{ marginBottom: spacing.md }}>BY POSITION</Text>
            {segments.map((s, i) => (
              <MotiView
                key={s.symbol}
                from={{ opacity: 0, translateX: -8 }}
                animate={{ opacity: 1, translateX: 0 }}
                transition={{ type: 'timing', duration: 260, delay: 380 + i * 60 }}
                style={styles.legendRow}
              >
                <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                <Text style={styles.legendSymbol}>{s.symbol}</Text>
                <View style={{ flex: 1 }} />
                <Text style={styles.legendValue}>{naira(s.value)}</Text>
                <Text style={styles.legendPct}>{Math.round(s.pct * 100)}%</Text>
              </MotiView>
            ))}
          </MotiView>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

// ─────────────────────────────────────────────────────────────
// CalculatingLoader — brand-red ring that pulses + rotates while
// the "computation" is imagined to be running.
// ─────────────────────────────────────────────────────────────
function CalculatingLoader() {
  const rot = useSharedValue(0)
  const scale = useSharedValue(1)

  useEffect(() => {
    rot.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.linear }), -1, false)
    scale.value = withRepeat(withTiming(1.08, { duration: 700, easing: Easing.inOut(Easing.quad) }), -1, true)
    return () => {
      // Modal can be dismissed inside the 1.2s loader window — cancel the
      // infinite worklet loops or Reanimated posts "attempt to run on
      // unmounted component" warnings in dev.
      cancelAnimation(rot)
      cancelAnimation(scale)
    }
  }, [rot, scale])

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rot.value * 360}deg` }, { scale: scale.value }],
  }))

  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing['3xl'] }}>
      <View style={loaderStyles.wrap}>
        <Animated.View style={[loaderStyles.ring, ringStyle]} />
        <View style={loaderStyles.dot} />
      </View>
      <MotiView
        from={{ opacity: 0.5 }}
        animate={{ opacity: 1 }}
        transition={{ type: 'timing', duration: 700, loop: true }}
        style={{ marginTop: spacing.lg }}
      >
        <Text variant="smallStrong" tone="muted">Calculating positions…</Text>
      </MotiView>
    </View>
  )
}
const loaderStyles = StyleSheet.create({
  wrap: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 4,
    borderColor: 'rgba(218,169,47,0.18)',
    borderTopColor: '#DAA92F',
    borderRightColor: '#DAA92F',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#DAA92F',
  },
})

const makeStyles = () => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  iconBtn: {
    width: 44, height: 44,
    borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bgSubtle,
  },
  netWorth: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -0.8,
    marginTop: spacing.sm,
  },
  chartWrap: {
    alignItems: 'center',
    marginTop: spacing['3xl'],
    minHeight: 250,
  },
  centerVal: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -0.5,
    marginTop: 4,
    maxWidth: 130,
    textAlign: 'center',
  },
  centerLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 1.2,
  },
  legendCard: {
    marginTop: spacing['3xl'],
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendSymbol: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 0.2,
  },
  legendValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  legendPct: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textMuted,
    minWidth: 32,
    textAlign: 'right',
  },
})
