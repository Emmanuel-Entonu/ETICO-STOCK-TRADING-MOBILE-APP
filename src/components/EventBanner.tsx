import { useEffect } from 'react'
import { View, Pressable, Image } from 'react-native'
import { useRouter } from 'expo-router'
import { useShallow } from 'zustand/react/shallow'
import { Text, Icon } from '@/ui'
import { colors, spacing, radii } from '@/theme'
import { useEventsStore } from '@/store/eventsStore'
import { isOpen, unitsHeld, type AppEvent } from '@/lib/eventsApi'
import { EVENT_ASSETS, BANNER_ASPECT } from '@/lib/eventAssets'

/** Event logo: the event's image, or a branded tile with its initials. */
export function EventLogo({ event, size = 36 }: { event: AppEvent; size?: number }) {
  const local = EVENT_ASSETS[event.id]?.logo
  if (local) {
    // Square, sharp corners: the artwork has its own frame.
    return <Image source={local} style={{ width: size, height: size }} />
  }
  if (event.logo_url) {
    return <Image source={{ uri: event.logo_url }} style={{ width: size, height: size, borderRadius: size / 4 }} />
  }
  const initials = event.title.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 3).map((w) => w[0]).join('')
  return (
    <View style={{ width: size, height: size, borderRadius: size / 4, backgroundColor: '#1B2447', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: size * 0.3, lineHeight: size * 0.38 }}>{initials}</Text>
    </View>
  )
}

/** Wide event artwork (2:1), full width with rounded corners. Nothing if none. */
export function EventHero({ event, radius = radii.lg }: { event: AppEvent; radius?: number }) {
  const banner = EVENT_ASSETS[event.id]?.banner
  if (!banner) return null
  return (
    <Image
      source={banner}
      resizeMode="cover"
      accessibilityLabel={`${event.title} banner`}
      style={{ width: '100%', aspectRatio: BANNER_ASPECT, borderRadius: radius, backgroundColor: colors.bgSubtle }}
    />
  )
}

const fmtClose = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) : null

// Home: one slim row per ongoing event, sitting above the wealth card.
// Shows "Subscribed" once the user has reached their share limit.
export function EventBanner() {
  const router = useRouter()
  const { events, subs, load } = useEventsStore(useShallow((s) => ({ events: s.events, subs: s.subs, load: s.load })))
  useEffect(() => { load() }, [load])

  const ongoing = events.filter((e) => isOpen(e))
  if (ongoing.length === 0) return null

  return (
    <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
      {ongoing.slice(0, 2).map((e) => {
        const held = unitsHeld(subs.filter((s) => s.event_id === e.id))
        const done = held >= e.max_units_per_user
        const closes = fmtClose(e.closes_at)
        return (
          <Pressable
            key={e.id}
            onPress={() => router.push(`/events/${e.id}` as never)}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: spacing.md,
              paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
              borderRadius: radii.md, borderWidth: 1,
              borderColor: done ? colors.positive : colors.border,
              backgroundColor: pressed ? colors.bgSubtle : colors.surface,
            })}
          >
            <EventLogo event={e} size={32} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="smallStrong" numberOfLines={1}>{e.title}</Text>
              <Text variant="small" tone={done ? 'positive' : 'muted'} numberOfLines={1}>
                {done ? 'Subscribed · you’ve reached your limit' : `Ongoing event${closes ? ` · closes ${closes}` : ''}`}
              </Text>
            </View>
            {done
              ? <Icon name="solar:check-circle-bold" size={20} color={colors.positive} />
              : <Icon name="solar:alt-arrow-right-linear" size={18} color={colors.textMuted} />}
          </Pressable>
        )
      })}
    </View>
  )
}
