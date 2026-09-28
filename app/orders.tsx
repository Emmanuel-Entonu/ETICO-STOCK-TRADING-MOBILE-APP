import { useCallback, useEffect, useState } from 'react'
import { View, FlatList, Pressable, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { usePortfolioStore } from '@/store/portfolioStore'
import { useAuthStore } from '@/store/authStore'
import { Text, Row, Icon, toast, Loader, SkeletonList } from '@/ui'
import { colors, spacing, radii } from '@/theme'
import { OrderRow } from '@/components/OrderRow'
import type { PacOrderListItem } from '@/lib/pacApi'
import { useShallow } from 'zustand/react/shallow'

export default function OrdersHistoryScreen() {
  const router = useRouter()
  const pacAccountId = useAuthStore((s) => s.pacAccountId)
  const { pacOrders, loadingOrders, loadOrders, cancelOrder } = usePortfolioStore(useShallow((s) => ({ pacOrders: s.pacOrders, loadingOrders: s.loadingOrders, loadOrders: s.loadOrders, cancelOrder: s.cancelOrder })))
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => { if (pacAccountId) loadOrders(pacAccountId) }, [pacAccountId])

  const onRefresh = useCallback(async () => {
    if (!pacAccountId) return
    setRefreshing(true)
    try { await loadOrders(pacAccountId) } finally { setRefreshing(false) }
  }, [pacAccountId, loadOrders])

  // Virtualized: order history grows without bound, and mapping every row into a
  // ScrollView made this screen slower to open the longer someone traded.
  const renderItem = useCallback(({ item: o }: { item: PacOrderListItem }) => (
    <OrderRow
      order={o}
      cancelling={cancellingId === o.id}
      onPress={() => router.push(`/receipt/${o.id}` as never)}
      onCancel={async () => {
        setCancellingId(o.id)
        try { await cancelOrder(o.id, null) }
        catch (e) { toast.error('Cancel failed', (e as Error).message) }
        finally { setCancellingId(null) }
      }}
    />
  ), [cancellingId, router, cancelOrder])

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Row gap="md" align="center" style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ width: 40, height: 40, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSubtle }}>
          <Icon name="solar:alt-arrow-left-linear" size={20} color={colors.text} />
        </Pressable>
        <Text variant="h2">Order history</Text>
      </Row>

      {loadingOrders && pacOrders.length === 0 ? (
        <SkeletonList rows={8} />
      ) : (
        <FlatList
          data={pacOrders}
          keyExtractor={(o) => o.id}
          renderItem={renderItem}
          extraData={cancellingId}
          ItemSeparatorComponent={Separator}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing['3xl'], flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          initialNumToRender={12}
          windowSize={7}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing['3xl'] }}>
              <View style={{ width: 64, height: 64, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSubtle, marginBottom: spacing.lg }}>
                <Icon name="solar:document-text-linear" size={28} color={colors.textMuted} />
              </View>
              <Text variant="bodyStrong">No orders yet</Text>
              <Text variant="small" tone="muted" align="center" style={{ marginTop: spacing.xs, maxWidth: 260 }}>
                When you buy or sell a stock, it will show up here with its status.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}

function Separator() {
  return <View style={{ height: spacing.sm }} />
}
