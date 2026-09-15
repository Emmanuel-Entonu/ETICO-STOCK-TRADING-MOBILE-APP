import { useCallback, useMemo, useEffect, useState } from 'react'
import { View, ScrollView, Pressable, StyleSheet, Dimensions, Image, type ImageSourcePropType } from 'react-native'
import { MotiView } from 'moti'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { usePortfolioStore } from '@/store/portfolioStore'
import { Text } from '@/ui'
import { colors, spacing, radii, useThemedStyles, useEffectiveScheme } from '@/theme'
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar'
import { isEthical, ETHICAL_TICKERS } from '@/lib/ethicalTickers'
import { Icon } from '@/ui'

// Bundled artwork for each asset category card. `require` at module scope
// so Metro can hash and embed them at build time.
const CATEGORY_IMAGES = {
  ethical:  require('../../assets/asset-icons/ethical-stocks.png') as ImageSourcePropType,
  nigerian: require('../../assets/asset-icons/ngx-stocks.png')     as ImageSourcePropType,
  bonds:    require('../../assets/asset-icons/sukuk-bonds.png')    as ImageSourcePropType,
  savings:  require('../../assets/asset-icons/naira-savings.png')  as ImageSourcePropType,
} as const

interface RiskTone {
  // Text + icon color on the card.
  fg:        string
  // Full-card tint that sits behind everything (used at low opacity in
  // light mode, at higher opacity in dark mode).
  tint:      string
  // Small accent used for the icon square background.
  accent:    string
  // Color of the card's outer border.
  border:    string
}

interface RiskProfile {
  key:      'low' | 'medium' | 'high'
  label:    string
  subtitle: string
  icon:     string
  light:    RiskTone
  dark:     RiskTone
}

// Dark-mode variants use richer, luminous colors on top of a darkened tint
// so the cards read as three distinct states even under the OLED-black bg.
// Light-mode variants keep the pastel bg / dark-ink fg pairing.
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

interface AssetCategory {
  key:      keyof typeof CATEGORY_IMAGES
  title:    string
  subtitle: string
  badge?:   'New' | 'Soon'
  route?:   string
}

const SCREEN_W = Dimensions.get('window').width
const CARD_GAP = 12
const GRID_H_PADDING = 16
// Two cards per row, computed off screen width so centering is exact.
const CARD_W = Math.floor((SCREEN_W - GRID_H_PADDING * 2 - CARD_GAP) / 2)

export default function AssetsScreen() {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const { marketData, loadMarketData } = usePortfolioStore()

  // Bump this on every tab focus so the MotiView keys change and the cards
  // re-run their stagger animation each time the user visits the tab.
  const [focusKey, setFocusKey] = useState(0)
  useFocusEffect(useCallback(() => {
    setFocusKey(k => k + 1)
  }, []))

  useEffect(() => { if (marketData.length === 0) loadMarketData() }, [])

  const ethicalCount  = useMemo(() => marketData.filter(s => isEthical(s.symbol)).length, [marketData])

  // Strictly ethical now (MD directive) — the old NGX-all card is merged into
  // the combined ethical hero below. Only the "Soon" products remain in the grid.
  const ethicalSubtitle = `${ethicalCount || ETHICAL_TICKERS.size} Shariah-screened on the NGX`
  const categories: AssetCategory[] = [
    {
      key: 'bonds',
      title: 'Sukuk & Bonds',
      subtitle: 'Fixed-income instruments',
      badge: 'Soon',
    },
    {
      key: 'savings',
      title: 'Halal Savings',
      subtitle: 'Grow cash the halal way',
      badge: 'Soon',
    },
  ]

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE + spacing.lg }}>
        {/* Centered header */}
        <View style={styles.header}>
          <Text variant="h1">Assets</Text>
        </View>

        <View style={styles.eyebrowWrap}>
          <Text variant="eyebrow" tone="muted">ETHICAL INVESTING</Text>
        </View>

        <View style={styles.gridOuter}>
          {/* Combined, centered ethical hero — both graphics on opposite
              corners. Strictly ethical: this is the one way into the market. */}
          <MotiView
            key={`combo-${focusKey}`}
            from={{ opacity: 0, translateY: 18, scale: 0.96 }}
            animate={{ opacity: 1, translateY: 0, scale: 1 }}
            transition={{ type: 'spring', damping: 18, stiffness: 220, mass: 0.8, delay: 60 }}
          >
            <CombinedEthicalCard
              ethicalImg={CATEGORY_IMAGES.ethical}
              ngxImg={CATEGORY_IMAGES.nigerian}
              subtitle={ethicalSubtitle}
              onPress={() => router.push('/(app)/market?filter=ethical')}
            />
          </MotiView>

          {/* Remaining products (Soon) — two-up */}
          <View style={[styles.grid, { marginTop: CARD_GAP }]}>
            {categories.map((c, i) => (
              <MotiView
                key={`${c.key}-${focusKey}`}
                from={{ opacity: 0, translateY: 18, scale: 0.94 }}
                animate={{ opacity: 1, translateY: 0, scale: 1 }}
                transition={{ type: 'spring', damping: 18, stiffness: 220, mass: 0.8, delay: 160 + i * 70 }}
              >
                <AssetCard
                  title={c.title}
                  subtitle={c.subtitle}
                  image={CATEGORY_IMAGES[c.key]}
                  badge={c.badge}
                  onPress={c.route ? () => router.push(c.route! as never) : undefined}
                />
              </MotiView>
            ))}
          </View>
        </View>

        {/* Risk-level section */}
        <View style={styles.riskWrap}>
          <Text variant="eyebrow" tone="muted" style={styles.riskEyebrow}>BY RISK LEVEL</Text>
          {RISK_PROFILES.map((r, i) => (
            <MotiView
              key={`${r.key}-${focusKey}`}
              from={{ opacity: 0, translateX: -14 }}
              animate={{ opacity: 1, translateX: 0 }}
              transition={{ type: 'timing', duration: 320, delay: 380 + i * 90 }}
              style={{ marginBottom: spacing.md }}
            >
              <RiskCard
                profile={r}
                onPress={() => router.push(`/(app)/market?risk=${r.key}` as never)}
              />
            </MotiView>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

// ─────────────────────────────────────────────────────────────
// RiskCard — full-width, gradient tint per risk level, custom
// "risk meter" (3 stacked pips filling proportionally to the level),
// icon in a colored square, chevron on the right.
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
          // Dark: solid tinted card, coloured border for identity.
          // Light: neutral surface + a coloured tint overlay below.
          backgroundColor: isDark ? tone.tint : colors.bgSubtle,
          borderColor:     isDark ? tone.border : colors.border,
        },
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
    >
      {/* Light-mode tint overlay — skipped in dark mode where the card bg
          IS the tint. */}
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
                height: 10 + i * 6,           // 10 / 16 / 22 — signal-bar ramp
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

// Combined, centered ethical hero: the Ethical + NGX graphics pinned to
// opposite corners with the copy centred between them.
function CombinedEthicalCard({ ethicalImg, ngxImg, subtitle, onPress }: {
  ethicalImg: ImageSourcePropType
  ngxImg:     ImageSourcePropType
  subtitle:   string
  onPress:    () => void
}) {
  const styles = useThemedStyles(makeStyles)
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.comboCard, pressed && { transform: [{ scale: 0.99 }] }]}
    >
      <Image source={ethicalImg} style={styles.comboImgTL} resizeMode="contain" />
      <Image source={ngxImg} style={styles.comboImgBR} resizeMode="contain" />
      <View style={styles.comboCenter}>
        <View style={styles.comboBadge}>
          <Icon name="solar:leaf-bold" size={12} color={colors.accentInk} />
          <Text style={styles.comboBadgeText}>SHARIAH-SCREENED</Text>
        </View>
        <Text style={styles.comboTitle}>Ethical Stocks</Text>
        <Text style={styles.comboSubtitle} numberOfLines={1}>{subtitle}</Text>
        <View style={styles.comboCta}>
          <Text style={styles.comboCtaText}>Explore</Text>
          <Icon name="solar:alt-arrow-right-linear" size={14} color={colors.textInverse} />
        </View>
      </View>
    </Pressable>
  )
}

function AssetCard({ title, subtitle, image, badge, onPress }: {
  title:    string
  subtitle: string
  image:    ImageSourcePropType
  badge?:   'New' | 'Soon'
  onPress?: () => void
}) {
  const styles = useThemedStyles(makeStyles)
  const disabled = !onPress
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && !disabled && { transform: [{ scale: 0.98 }] },
        disabled && { opacity: 0.7 },
      ]}
    >
      {badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
      <View style={styles.iconTop}>
        <Image source={image} style={styles.cardImage} resizeMode="contain" />
      </View>
      <View style={styles.textBottom}>
        <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.cardSubtitle} numberOfLines={2}>{subtitle}</Text>
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
    width: SCREEN_W - GRID_H_PADDING * 2,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  gridOuter: {
    alignItems: 'center',
  },
  grid: {
    width: SCREEN_W - GRID_H_PADDING * 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
    justifyContent: 'flex-start',
  },
  comboCard: {
    width: SCREEN_W - GRID_H_PADDING * 2,
    alignSelf: 'center',
    minHeight: 230,
    borderRadius: radii.lg,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['2xl'],
  },
  comboImgTL: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    width: 86,
    height: 86,
  },
  comboImgBR: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    width: 86,
    height: 86,
  },
  comboCenter: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  comboBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSubtle,
    marginBottom: spacing.sm,
  },
  comboBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.accentInk,
    letterSpacing: 0.5,
  },
  comboTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.4,
  },
  comboSubtitle: {
    fontSize: 12.5,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
  comboCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    height: 38,
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
  },
  comboCtaText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textInverse,
  },
  card: {
    width: CARD_W,
    minHeight: 200,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'space-between',
  },
  iconTop: {
    alignItems: 'flex-start',
  },
  cardImage: {
    width: 92,
    height: 92,
  },
  textBottom: {
    marginTop: spacing.md,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 17,
  },
  riskWrap: {
    marginTop: spacing['2xl'],
    paddingHorizontal: GRID_H_PADDING,
    width: SCREEN_W - GRID_H_PADDING * 2,
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
  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.bgMuted,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
})
