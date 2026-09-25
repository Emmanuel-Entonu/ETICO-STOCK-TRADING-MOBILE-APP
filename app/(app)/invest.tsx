import { useCallback, useMemo, useEffect, useState } from 'react'
import { View, ScrollView, Pressable, StyleSheet, Dimensions, Image, type ImageSourcePropType } from 'react-native'
import { MotiView } from 'moti'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { usePortfolioStore } from '@/store/portfolioStore'
import { Text, Icon } from '@/ui'
import { colors, spacing, radii, useThemedStyles, useEffectiveScheme } from '@/theme'
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar'
import { isEthical, ETHICAL_TICKERS } from '@/lib/ethicalTickers'
import { useShallow } from 'zustand/react/shallow'

// Full-bleed background artwork for each product card. `require` at module scope
// so Metro can hash and embed them at build time.
const CARD_IMAGES = {
  stocks:  require('../../assets/asset-icons/card-ethical-stocks.png') as ImageSourcePropType,
  bonds:   require('../../assets/asset-icons/card-bonds.png')          as ImageSourcePropType,
  savings: require('../../assets/asset-icons/card-savings.png')        as ImageSourcePropType,
} as const

interface RiskTone {
  fg:     string
  tint:   string
  accent: string
  border: string
}

interface RiskProfile {
  key:      'low' | 'medium' | 'high'
  label:    string
  subtitle: string
  icon:     string
  light:    RiskTone
  dark:     RiskTone
}

const RISK_PROFILES: RiskProfile[] = [
  {
    key: 'low',
    label: 'Low-risk mix',
    subtitle: 'Banks · Insurance · Consumer',
    icon: 'solar:shield-check-bold',
    light: { fg: '#047857', tint: '#D1FAE5', accent: '#047857', border: '#A7F3D0' },
    dark:  { fg: '#34D399', tint: '#0F241C', accent: '#059669', border: '#134E3F' },
  },
  {
    key: 'medium',
    label: 'Medium-risk mix',
    subtitle: 'Cement · Pharma · Industrial',
    icon: 'solar:chart-2-bold',
    light: { fg: '#B45309', tint: '#FEF3C7', accent: '#B45309', border: '#FDE68A' },
    dark:  { fg: '#FBBF24', tint: '#2A1E0B', accent: '#D97706', border: '#4D3512' },
  },
  {
    key: 'high',
    label: 'High-risk mix',
    subtitle: 'Oil & Gas · Volatile & small-caps',
    icon: 'solar:danger-circle-bold',
    light: { fg: '#B7161F', tint: '#FEE2E2', accent: '#B7161F', border: '#FECACA' },
    dark:  { fg: '#F87171', tint: '#2A1213', accent: '#DC2626', border: '#4D1B1E' },
  },
]

interface Product {
  key:      keyof typeof CARD_IMAGES
  title:    string
  subtitle: string
  icon:     string
  dark:     boolean          // is the card's left (text) area dark? → white text
  badge?:   string
  route?:   string
}

const SCREEN_W = Dimensions.get('window').width
const CARD_GAP = 12
const GRID_H_PADDING = 16
const CONTENT_W = SCREEN_W - GRID_H_PADDING * 2
const CARD_HEIGHT = 118

export default function AssetsScreen() {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const { marketData, loadMarketData } = usePortfolioStore(useShallow((s) => ({ marketData: s.marketData, loadMarketData: s.loadMarketData })))

  // Bump on every tab focus so the MotiView keys change and the cards re-run
  // their stagger animation each visit.
  const [focusKey, setFocusKey] = useState(0)
  useFocusEffect(useCallback(() => { setFocusKey(k => k + 1) }, []))

  useEffect(() => { if (marketData.length === 0) loadMarketData() }, [])

  const ethicalCount = useMemo(() => marketData.filter(s => isEthical(s.symbol)).length, [marketData])
  const stockCount = ethicalCount || ETHICAL_TICKERS.size

  const products: Product[] = [
    {
      key: 'stocks',
      title: 'Ethical Stocks',
      subtitle: `${stockCount} stocks screened on the NGX`,
      icon: 'solar:leaf-bold',
      dark: true,
      badge: 'Ethical',
      route: '/(app)/market?filter=ethical',
    },
    {
      key: 'bonds',
      title: 'Ethical Bonds',
      subtitle: 'Fixed-income instruments',
      icon: 'solar:document-text-bold',
      dark: false,
      badge: 'Soon',
    },
    {
      key: 'savings',
      title: 'Ethical Savings',
      subtitle: 'Grow cash the ethical way',
      icon: 'solar:money-bag-bold',
      dark: true,
      badge: 'Soon',
    },
  ]

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE + spacing.lg }}>
        <View style={styles.header}>
          <Text variant="h1">Assets</Text>
        </View>

        <View style={styles.eyebrowWrap}>
          <Text variant="eyebrow" tone="muted">ETHICAL INVESTING</Text>
        </View>

        <View style={styles.stack}>
          {products.map((p, i) => (
            <MotiView
              key={`${p.key}-${focusKey}`}
              from={{ opacity: 0, translateY: 18, scale: 0.96 }}
              animate={{ opacity: 1, translateY: 0, scale: 1 }}
              transition={{ type: 'spring', damping: 18, stiffness: 220, mass: 0.8, delay: 60 + i * 80 }}
            >
              <ProductCard
                product={p}
                onPress={p.route ? () => router.push(p.route! as never) : undefined}
              />
            </MotiView>
          ))}
        </View>

        {/* By risk level — unchanged */}
        <View style={styles.riskWrap}>
          <Text variant="eyebrow" tone="muted" style={styles.riskEyebrow}>BY RISK LEVEL</Text>
          {RISK_PROFILES.map((r, i) => (
            <MotiView
              key={`${r.key}-${focusKey}`}
              from={{ opacity: 0, translateX: -14 }}
              animate={{ opacity: 1, translateX: 0 }}
              transition={{ type: 'timing', duration: 320, delay: 360 + i * 90 }}
              style={{ marginBottom: spacing.md }}
            >
              <RiskCard profile={r} onPress={() => router.push(`/(app)/market?risk=${r.key}` as never)} />
            </MotiView>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

// ─────────────────────────────────────────────────────────────
// ProductCard — full-width card with a full-bleed background image,
// content overlaid on the readable (left) side: icon tile, title,
// subtitle, and either an arrow FAB (active) or a "Soon" pill.
// ─────────────────────────────────────────────────────────────
function ProductCard({ product, onPress }: { product: Product; onPress?: () => void }) {
  const styles = useThemedStyles(makeStyles)
  const disabled = !onPress
  const dark = product.dark

  const fg      = dark ? '#FFFFFF' : '#0B1F14'
  const subFg   = dark ? 'rgba(255,255,255,0.74)' : 'rgba(11,31,20,0.66)'
  const tileBg  = dark ? 'rgba(255,255,255,0.16)' : 'rgba(11,31,20,0.10)'
  // A soft scrim on the text side improves legibility over the artwork.
  const scrim   = dark ? 'rgba(6,20,12,0.30)' : 'rgba(255,255,255,0.14)'

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.heroCard, pressed && !disabled && { transform: [{ scale: 0.99 }] }]}
    >
      {/* Explicit width/height — a New-Arch <Image> with only absoluteFill renders
          at its intrinsic size and ignores cover, so it must be sized directly. */}
      <Image
        source={CARD_IMAGES[product.key]}
        style={{ width: CONTENT_W, height: CARD_HEIGHT }}
        resizeMode="cover"
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: scrim }]} />

      <View style={styles.heroContent}>
        <View style={[styles.heroTile, { backgroundColor: tileBg }]}>
          <Icon name={product.icon} size={24} color={fg} />
        </View>

        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={[styles.heroTitle, { color: fg }]} numberOfLines={1}>{product.title}</Text>
          <Text style={[styles.heroSub, { color: subFg }]} numberOfLines={2}>{product.subtitle}</Text>
        </View>

        {disabled ? (
          <View style={styles.heroSoon}>
            <Text style={[styles.heroSoonText, { color: fg }]}>Soon</Text>
          </View>
        ) : (
          <View style={styles.heroFab}>
            <Icon name="solar:arrow-right-linear" size={20} color="#0B1F14" />
          </View>
        )}
      </View>

      {product.badge && !disabled && (
        <View style={styles.heroBadge}>
          <Text style={[styles.heroBadgeText, { color: fg }]}>{product.badge}</Text>
        </View>
      )}
    </Pressable>
  )
}

// ─────────────────────────────────────────────────────────────
// RiskCard — unchanged from before.
// ─────────────────────────────────────────────────────────────
function RiskCard({ profile, onPress }: { profile: RiskProfile; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles)
  const scheme = useEffectiveScheme()
  const isDark = scheme === 'dark'
  const tone   = isDark ? profile.dark : profile.light
  const filled = profile.key === 'low' ? 1 : profile.key === 'medium' ? 2 : 3

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.riskCard,
        {
          backgroundColor: isDark ? tone.tint : colors.bgSubtle,
          borderColor:     isDark ? tone.border : colors.border,
        },
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
    >
      {!isDark && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: tone.tint, opacity: 0.55, borderRadius: radii.lg }]} />
      )}
      <View style={[styles.riskIconSquare, { backgroundColor: tone.accent }]}>
        <Icon name={profile.icon} size={22} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text style={[styles.riskTitle, { color: tone.fg }]}>{profile.label}</Text>
        <Text style={[styles.riskSubtitle, isDark && { color: tone.fg, opacity: 0.7 }]} numberOfLines={1}>
          {profile.subtitle}
        </Text>
      </View>
      <View style={styles.riskMeter}>
        {[0, 1, 2].map(i => (
          <View
            key={i}
            style={[
              styles.riskPip,
              {
                height: 10 + i * 6,
                backgroundColor: i < filled ? tone.fg : 'transparent',
                borderColor: tone.fg,
                opacity: i < filled ? 1 : 0.4,
              },
            ]}
          />
        ))}
      </View>
    </Pressable>
  )
}

const makeStyles = () => StyleSheet.create({
  header: {
    paddingTop: spacing.md,
    paddingBottom: spacing['2xl'],
    alignItems: 'center',
  },
  eyebrowWrap: {
    width: CONTENT_W,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  stack: {
    width: CONTENT_W,
    alignSelf: 'center',
    gap: CARD_GAP,
  },
  // ── Product hero cards ──
  heroCard: {
    width: CONTENT_W,
    height: CARD_HEIGHT,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.bgSubtle,
  },
  heroContent: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  heroTile: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  heroSub: {
    fontSize: 12.5,
    fontWeight: '500',
    marginTop: 3,
    lineHeight: 17,
  },
  heroFab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  heroSoon: {
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroSoonText: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  heroBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
  },
  heroBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  // ── Risk cards ──
  riskWrap: {
    marginTop: spacing['2xl'],
    paddingHorizontal: GRID_H_PADDING,
    width: CONTENT_W,
    alignSelf: 'center',
  },
  riskEyebrow: {
    marginBottom: spacing.md,
  },
  riskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    minHeight: 82,
  },
  riskIconSquare: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riskTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  riskSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 3,
    letterSpacing: 0.1,
  },
  riskMeter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    marginLeft: spacing.md,
  },
  riskPip: {
    width: 6,
    borderWidth: 1.5,
    borderRadius: 2,
  },
})
