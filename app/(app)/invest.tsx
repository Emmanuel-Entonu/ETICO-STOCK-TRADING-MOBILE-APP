import { useMemo, useEffect, useRef, useState } from 'react'
import { View, ScrollView, Pressable, StyleSheet, Dimensions, Image, TextInput, Keyboard, BackHandler, type ImageSourcePropType } from 'react-native'
import { MotiView } from 'moti'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { usePortfolioStore } from '@/store/portfolioStore'
import { Text, Icon } from '@/ui'
import { colors, spacing, radii, typography, useThemedStyles } from '@/theme'
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar'
import { isEthical, ETHICAL_TICKERS } from '@/lib/ethicalTickers'
import { useShallow } from 'zustand/react/shallow'
import { RiskDial } from '@/components/RiskDial'
import { RecommendedRail } from '@/components/RecommendedRail'
import { AssetSearch } from '@/components/AssetSearch'
import { useEventsStore } from '@/store/eventsStore'
import { isOpen } from '@/lib/eventsApi'

// Full-bleed background artwork for each product card. `require` at module scope
// so Metro can hash and embed them at build time.
const CARD_IMAGES = {
  stocks:  require('../../assets/asset-icons/card-ethical-stocks.png') as ImageSourcePropType,
  bonds:   require('../../assets/asset-icons/card-bonds.png')          as ImageSourcePropType,
  savings: require('../../assets/asset-icons/card-savings.png')        as ImageSourcePropType,
  events:  require('../../assets/asset-icons/card-events.jpg')         as ImageSourcePropType,
} as const

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

  // Entrance animation plays once (first mount). It used to replay on every
  // tab visit, which made switching to Assets feel slow.
  const focusKey = 0

  // Inline search: offerings + stocks, right here on the Assets page.
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<TextInput>(null)
  const closeSearch = () => { setQuery(''); setSearching(false); Keyboard.dismiss() }

  useEffect(() => { if (marketData.length === 0) loadMarketData() }, [])
  // Android back closes the search instead of leaving the page.
  useEffect(() => {
    if (!searching) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { closeSearch(); return true })
    return () => sub.remove()
  }, [searching])

  const ethicalCount = useMemo(() => marketData.filter(s => isEthical(s.symbol)).length, [marketData])
  const stockCount = ethicalCount || ETHICAL_TICKERS.size

  // Events section card (IPOs and public offers). Its own page lists every event.
  const allEvents = useEventsStore((s) => s.events)
  const loadEvents = useEventsStore((s) => s.load)
  useEffect(() => { loadEvents() }, [loadEvents])
  const openEvents = allEvents.filter((e) => isOpen(e))
  const eventsCard: Product = {
    key: 'events',
    title: 'Events',
    subtitle: openEvents.length === 1
      ? `IPOs & public offers · ${openEvents[0].title.replace(/ IPO$/, '')} IPO open`
      : openEvents.length > 1 ? `IPOs & public offers · ${openEvents.length} open now` : 'IPOs & public offers',
    icon: 'solar:ticket-bold',
    dark: true,
    badge: openEvents.length ? 'Live' : undefined,
    route: '/events',
  }

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
      <ScrollView contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE + spacing.lg }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={styles.header}>
          <Text variant="h1">Assets</Text>
          <Pressable
            onPress={() => { setSearching(true); setTimeout(() => inputRef.current?.focus(), 50) }}
            accessibilityRole="button"
            accessibilityLabel="Search assets and stocks"
            hitSlop={10}
            style={({ pressed }) => [styles.searchBtn, pressed && { opacity: 0.6 }]}
          >
            <Icon name="solar:magnifer-linear" size={22} color={colors.text} />
          </Pressable>
        </View>

        {searching && (
          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <Icon name="solar:magnifer-linear" size={18} color={colors.textMuted} />
              <TextInput
                ref={inputRef}
                value={query}
                onChangeText={setQuery}
                placeholder="Search stocks, bonds, savings…"
                placeholderTextColor={colors.textSubtle}
                style={styles.searchInput}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
              />
              {query.length > 0 && (
                <Pressable onPress={() => setQuery('')} hitSlop={8}>
                  <Icon name="solar:close-circle-bold" size={18} color={colors.textSubtle} />
                </Pressable>
              )}
            </View>
            <Pressable onPress={closeSearch} hitSlop={8} style={{ paddingLeft: spacing.md }}>
              <Text variant="smallStrong" tone="brand">Cancel</Text>
            </Pressable>
          </View>
        )}

        {searching ? (
          <AssetSearch
            query={query}
            marketData={marketData}
            onOpen={(route) => { closeSearch(); router.push(route as never) }}
          />
        ) : (
        <>

        {/* Events: its own section card, like the product cards below. */}
        <View style={styles.eyebrowWrap}>
          <Text variant="eyebrow" tone="muted">EVENTS</Text>
        </View>
        <View style={[styles.stack, styles.eventsWrap]}>
          <MotiView
            key={`events-${focusKey}`}
            from={{ opacity: 0, translateY: 18, scale: 0.96 }}
            animate={{ opacity: 1, translateY: 0, scale: 1 }}
            transition={{ type: 'spring', damping: 18, stiffness: 220, mass: 0.8, delay: 30 }}
          >
            <ProductCard product={eventsCard} onPress={() => router.push('/events' as never)} />
          </MotiView>
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

        {/* By risk level — one card: Conservative / Balanced / Growth (remembers the last choice) */}
        <View style={styles.riskWrap}>
          <Text variant="eyebrow" tone="muted" style={styles.riskEyebrow}>BY RISK LEVEL</Text>
          <MotiView
            key={`risk-${focusKey}`}
            from={{ opacity: 0, translateY: 14 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 320, delay: 360 }}
          >
            <RiskDial
              marketData={marketData}
              onViewAll={(k) => router.push(`/(app)/market?risk=${k}` as never)}
              onOpenStock={(sym) => router.push(`/trade/${sym}` as never)}
            />
          </MotiView>
        </View>

        {/* Recommended stocks */}
        <View style={{ marginTop: spacing.lg }}>
          <RecommendedRail />
        </View>
        </>
        )}
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

const makeStyles = () => StyleSheet.create({
  header: {
    paddingTop: spacing.md,
    paddingBottom: spacing['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: GRID_H_PADDING,
    marginTop: -spacing.lg,
    marginBottom: spacing.lg,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    height: 48,
  },
  searchInput: {
    flex: 1,
    ...typography.bodyStrong,
    color: colors.text,
  },
  searchBtn: {
    position: 'absolute',
    right: GRID_H_PADDING,
    top: spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSubtle,
  },
  eventsWrap: {
    width: CONTENT_W,
    alignSelf: 'center',
    marginBottom: spacing.xl,
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
    width: CONTENT_W,
    alignSelf: 'center',
  },
  riskEyebrow: {
    marginBottom: spacing.md,
  },
})
