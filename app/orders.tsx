import { useEffect, useState } from 'react'
import { View, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { usePortfolioStore } from '@/store/portfolioStore'
import { useAuthStore } from '@/store/authStore'
import { Text, Row, Stack, Icon, toast, Loader } from '@/ui'
import { colors, spacing, radii } from '@/theme'
import { OrderRow } from '@/components/OrderRow'

export default function OrdersHistoryScreen() {
  const router = useRouter()
  const pacAccountId = useAuthStore((s) => s.pacAccountId)
  const { pacOrders, loadingOrders, loadOrders, cancelOrder } = usePortfolioStore()
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  useEffect(() => { if (pacAccountId) loadOrders(pacAccountId) }, [pacAccountId])

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Row gap="md" align="center" style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ width: 40, height: 40, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSubtle }}>
          <Icon name="solar:alt-arrow-left-linear" size={20} color={colors.text} />
        </Pressable>
        <Text variant="h2">Order history</Text>
      </Row>

      {loadingOrders && pacOrders.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Loader size={56} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing['3xl'] }} showsVerticalScrollIndicator={false}>
          <Stack gap="sm">
            {pacOrders.map((o) => (
              <OrderRow
                key={o.id}
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
            ))}
          </Stack>
        </ScrollView>
      )}
    </SafeAreaView>
  )
}
