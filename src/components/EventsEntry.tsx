import { useEffect } from 'react'
import { View, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useShallow } from 'zustand/react/shallow'
import { Text, Icon } from '@/ui'
import { colors, spacing, radii } from '@/theme'
import { useEventsStore } from '@/store/eventsStore'
import { isOpen } from '@/lib/eventsApi'

// Assets page entry into Events (IPOs and future offers).
export function EventsEntry() {
  const router = useRouter()
  const { events, load } = useEventsStore(useShallow((s) => ({ events: s.events, load: s.load })))
  useEffect(() => { load() }, [load])
  const open = events.filter((e) => isOpen(e))
  const headline = open.length === 1 ? `${open[0].title} is open` : open.length > 1 ? `${open.length} offers open now` : 'IPOs and special offers'

  return (
    <Pressable
      onPress={() => router.push('/events' as never)}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: spacing.md,
        padding: spacing.md, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
        backgroundColor: pressed ? colors.bgSubtle : colors.surface,
      })}
    >
      <View style={{ width: 40, height: 40, borderRadius: radii.md, backgroundColor: colors.brandSubtle, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="solar:ticket-bold" size={20} color={colors.brand} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong">Events</Text>
        <Text variant="small" tone={open.length ? 'brand' : 'muted'} numberOfLines={1}>{headline}</Text>
      </View>
      <Icon name="solar:alt-arrow-right-linear" size={18} color={colors.textMuted} />
    </Pressable>
  )
}
