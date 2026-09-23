import { useEffect } from 'react'
import { View, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { usePortfolioStore } from '@/store/portfolioStore'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore, type NotifType } from '@/store/notificationStore'
import { Text, Row, Icon } from '@/ui'
import { colors, spacing, radii } from '@/theme'
import { useShallow } from 'zustand/react/shallow'

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (isNaN(then) || then < 10) return ''
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })
}

const TYPE_ICON: Record<NotifType, string> = {
  trade: 'solar:chart-2-bold',
  account: 'solar:shield-user-bold',
  system: 'solar:bell-bold',
}

export default function NotificationsScreen() {
  const router = useRouter()
  const { pacOrders, loadOrders } = usePortfolioStore(useShallow((s) => ({ pacOrders: s.pacOrders, loadOrders: s.loadOrders })))
  const { pacAccountId, kycStatus, cacsStatus, cacsRejectionReason } = useAuthStore(useShallow((s) => ({ pacAccountId: s.pacAccountId, kycStatus: s.kycStatus, cacsStatus: s.cacsStatus, cacsRejectionReason: s.cacsRejectionReason })))
  const { items, sync, markRead, markAllRead, remove } = useNotificationStore(useShallow((s) => ({ items: s.items, sync: s.sync, markRead: s.markRead, markAllRead: s.markAllRead, remove: s.remove })))

  useEffect(() => {
    if (pacAccountId) loadOrders(pacAccountId).catch(() => {})
  }, [pacAccountId])

  useEffect(() => {
    sync(pacOrders, { kycStatus, cacsStatus, cacsRejectionReason })
  }, [pacOrders, kycStatus, cacsStatus, cacsRejectionReason])

  const hasUnread = items.some(n => !n.read)

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Row justify="space-between" align="center" style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md }}>
        <Row gap="md" align="center">
          <Pressable onPress={() => router.back()} hitSlop={12} style={iconBtn()}>
            <Icon name="solar:alt-arrow-left-linear" size={20} color={colors.text} />
          </Pressable>
          <Text variant="h2">Notifications</Text>
        </Row>
        {hasUnread && (
          <Pressable onPress={markAllRead} hitSlop={8}>
            <Text variant="smallStrong" tone="accent">Mark all read</Text>
          </Pressable>
        )}
      </Row>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing['3xl'] }} showsVerticalScrollIndicator={false}>
        {items.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: spacing['4xl'] }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.bgSubtle, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md }}>
              <Icon name="solar:bell-linear" size={28} color={colors.textMuted} />
            </View>
            <Text variant="h3">You're all caught up</Text>
            <Text variant="body" tone="muted" align="center" style={{ marginTop: spacing.xs }}>
              Trade updates and account alerts will appear here.
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {items.map(n => (
              <Pressable
                key={n.id}
                onPress={() => {
                  markRead(n.id)
                  if (n.route) router.push(n.route as never)
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start',
                  padding: spacing.lg, borderRadius: radii.lg,
                  borderWidth: 1, borderColor: colors.border,
                  backgroundColor: n.read ? colors.surface : colors.brandSubtle,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.bgSubtle, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={TYPE_ICON[n.type]} size={20} color={n.type === 'trade' ? colors.accent : colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Row justify="space-between" align="center">
                    <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>{n.title}</Text>
                    {!n.read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginLeft: spacing.sm }} />}
                  </Row>
                  <Text variant="small" tone="muted" style={{ marginTop: 2 }}>{n.body}</Text>
                  {timeAgo(n.createdAt) ? <Text variant="small" tone="subtle" style={{ marginTop: 4 }}>{timeAgo(n.createdAt)}</Text> : null}
                </View>
                <Pressable
                  onPress={() => remove(n.id)}
                  hitSlop={10}
                  style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name="solar:close-circle-bold" size={18} color={colors.textSubtle} />
                </Pressable>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const iconBtn = () => ({
  width: 40, height: 40, borderRadius: radii.pill,
  alignItems: 'center' as const, justifyContent: 'center' as const,
  backgroundColor: colors.bgSubtle,
})
