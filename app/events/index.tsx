import { useEffect } from 'react'
import { View, ScrollView, Pressable, RefreshControl, Image, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { useShallow } from 'zustand/react/shallow'
import { Text, Icon, Skeleton } from '@/ui'
import { colors, spacing, radii } from '@/theme'
import { isOpen, unitsHeld, type AppEvent } from '@/lib/eventsApi'
import { EVENT_ASSETS, BANNER_ASPECT } from '@/lib/eventAssets'
import { useEventsStore } from '@/store/eventsStore'
import { EventLogo } from '@/components/EventBanner'

// Events: every IPO / public offer as its own banner card (like the Assets
// product cards). Tapping a card opens that event's page. Reusable for any
// future event: add its row + artwork and it appears here.
export default function EventsScreen() {
  const router = useRouter()
  const { events, subs, loaded, loading, load } = useEventsStore(useShallow((s) => ({
    events: s.events, subs: s.subs, loaded: s.loaded, loading: s.loading, load: s.load,
  })))
  useEffect(() => { load() }, [load])

  // Open events first, then upcoming, then closed.
  const rank = (e: AppEvent) => (isOpen(e) ? 0 : e.status === 'upcoming' ? 1 : 2)
  const sorted = [...events].sort((a, b) => rank(a) - rank(b))

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSubtle }}>
          <Icon name="solar:alt-arrow-left-linear" size={20} color={colors.text} />
        </Pressable>
        <View>
          <Text variant="h2">Events</Text>
          <Text variant="small" tone="muted">IPOs and public offers</Text>
        </View>
      </View>

      {!loaded ? (
        <View style={{ padding: spacing.xl, gap: spacing.lg }}>
          {[0, 1].map((i) => <Skeleton key={i} height={190} radius={radii.lg} />)}
        </View>
      ) : sorted.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
          <Icon name="solar:ticket-bold" size={40} color={colors.textSubtle} />
          <Text variant="bodyStrong" style={{ marginTop: spacing.md }}>No events right now</Text>
          <Text variant="small" tone="muted" align="center" style={{ marginTop: spacing.xs }}>
            IPOs and other offers will appear here.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing['3xl'], gap: spacing.lg }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
        >
          {sorted.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              subscribed={unitsHeld(subs.filter((s) => s.event_id === e.id)) >= e.max_units_per_user}
              onPress={() => router.push(`/events/${e.id}` as never)}
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

// One event as a banner card: its artwork full-bleed, with the title and
// status on a soft dark fade at the bottom and an arrow, like the product cards.
function EventCard({ event, subscribed, onPress }: { event: AppEvent; subscribed: boolean; onPress: () => void }) {
  const banner = EVENT_ASSETS[event.id]?.banner
  const open = isOpen(event)
  const closes = event.closes_at
    ? new Date(event.closes_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
    : null
  const status = subscribed
    ? 'Subscribed · you’ve reached your limit'
    : open ? `${event.kind === 'ipo' ? 'Primary offer' : 'Event'} · Open${closes ? ` · closes ${closes}` : ''}`
    : event.status === 'upcoming' ? 'Opens soon' : 'Closed'

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${event.title}. ${status}`}
      style={({ pressed }) => ({ borderRadius: radii.lg, overflow: 'hidden', backgroundColor: '#0B1F14', transform: [{ scale: pressed ? 0.99 : 1 }] })}
    >
      {banner ? (
        <Image source={banner} resizeMode="cover" style={{ width: '100%', aspectRatio: BANNER_ASPECT }} />
      ) : (
        <View style={{ width: '100%', aspectRatio: BANNER_ASPECT, alignItems: 'center', justifyContent: 'center' }}>
          <EventLogo event={event} size={72} />
        </View>
      )}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(6,20,12,0)', 'rgba(6,20,12,0.88)']}
        locations={[0.35, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={{ position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <EventLogo event={event} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 17, lineHeight: 22, fontWeight: '800' }} numberOfLines={2}>{event.title}</Text>
          <Text style={{ color: subscribed ? '#7EE2A0' : 'rgba(255,255,255,0.8)', fontSize: 12.5, lineHeight: 17, marginTop: 2 }} numberOfLines={1}>
            {status}
          </Text>
        </View>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={subscribed ? 'solar:check-circle-bold' : 'solar:arrow-right-linear'} size={20} color="#0B1F14" />
        </View>
      </View>
    </Pressable>
  )
}
