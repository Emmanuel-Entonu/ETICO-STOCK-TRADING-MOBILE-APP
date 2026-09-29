import { useEffect } from 'react'
import { View, ScrollView, Pressable, RefreshControl } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useShallow } from 'zustand/react/shallow'
import { Text, Icon, SkeletonList } from '@/ui'
import { colors, spacing, radii } from '@/theme'
import { naira } from '@/lib/format'
import { isOpen, unitPrice, unitsHeld } from '@/lib/eventsApi'
import { useEventsStore } from '@/store/eventsStore'
import { EventLogo, EventHero } from '@/components/EventBanner'

// Events: IPOs and other offers ETICO runs. Reusable for future events.
export default function EventsScreen() {
  const router = useRouter()
  const { events, subs, loaded, loading, load } = useEventsStore(useShallow((s) => ({
    events: s.events, subs: s.subs, loaded: s.loaded, loading: s.loading, load: s.load,
  })))
  useEffect(() => { load() }, [load])

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSubtle }}>
          <Icon name="solar:alt-arrow-left-linear" size={20} color={colors.text} />
        </Pressable>
        <Text variant="h2">Events</Text>
      </View>

      {!loaded ? (
        <SkeletonList rows={3} />
      ) : events.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
          <Icon name="solar:ticket-bold" size={40} color={colors.textSubtle} />
          <Text variant="bodyStrong" style={{ marginTop: spacing.md }}>No events right now</Text>
          <Text variant="small" tone="muted" align="center" style={{ marginTop: spacing.xs }}>
            IPOs and other offers will appear here.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.xl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
        >
          {events.map((e) => {
            const open = isOpen(e)
            const done = unitsHeld(subs.filter((s) => s.event_id === e.id)) >= e.max_units_per_user
            return (
              <Pressable
                key={e.id}
                onPress={() => router.push(`/events/${e.id}` as never)}
                style={({ pressed }) => ({
                  padding: spacing.lg, borderRadius: radii.lg, borderWidth: 1,
                  borderColor: colors.border, backgroundColor: pressed ? colors.bgSubtle : colors.surface,
                })}
              >
                <View style={{ marginBottom: spacing.md }}>
                  <EventHero event={e} radius={radii.md} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <EventLogo event={e} size={44} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="bodyStrong" numberOfLines={2}>{e.title}</Text>
                    <Text variant="eyebrow" tone={done ? 'positive' : open ? 'brand' : 'muted'} style={{ marginTop: 2 }}>
                      {done ? 'SUBSCRIBED' : open ? (e.kind === 'ipo' ? 'PRIMARY OFFER · OPEN' : 'OPEN') : e.status === 'upcoming' ? 'UPCOMING' : 'CLOSED'}
                    </Text>
                  </View>
                  <Icon name="solar:alt-arrow-right-linear" size={18} color={colors.textMuted} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md }}>
                  <Text variant="small" tone="muted">Unit price</Text>
                  <Text variant="smallStrong">{naira(unitPrice(e))}</Text>
                </View>
                {e.closes_at ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                    <Text variant="small" tone="muted">Closing date</Text>
                    <Text variant="smallStrong">
                      {new Date(e.closes_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            )
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}
