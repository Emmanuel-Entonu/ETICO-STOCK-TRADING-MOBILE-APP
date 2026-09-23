import { useEffect, useState } from 'react'
import { View, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { usePortfolioStore } from '@/store/portfolioStore'
import { useAuthStore } from '@/store/authStore'
import { Text, Row, Icon, Button, toast } from '@/ui'
import { colors, spacing, radii } from '@/theme'
import { naira } from '@/lib/format'
import { StockLogo } from '@/components/StockLogo'
import { useShallow } from 'zustand/react/shallow'

export default function OrderStatusScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { pacOrders, loadOrders, cancelOrder } = usePortfolioStore(useShallow((s) => ({ pacOrders: s.pacOrders, loadOrders: s.loadOrders, cancelOrder: s.cancelOrder })))
  const { pacAccountId } = useAuthStore(useShallow((s) => ({ pacAccountId: s.pacAccountId })))
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    if (!pacOrders.find(o => o.id === id) && pacAccountId) loadOrders(pacAccountId).catch(() => {})
  }, [id, pacAccountId])

  const order = pacOrders.find(o => o.id === id)

  if (!order) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
          <Text variant="h3" align="center">Order not found</Text>
          <Text variant="body" tone="muted" align="center" style={{ marginTop: spacing.sm }}>
            Pull to refresh your orders and try again.
          </Text>
          <Button title="Go back" variant="secondary" onPress={() => router.back()} style={{ marginTop: spacing.xl }} />
        </View>
      </SafeAreaView>
    )
  }

  const status = (order.orderStatus ?? 'UNKNOWN').toUpperCase()
  const filled = status === 'FILLED'
  const cancelled = status.includes('CANCEL')
  const active = !filled && !cancelled
  const label = filled ? 'Filled' : cancelled ? 'Cancelled' : 'Pending'
  const color = filled ? colors.positive : cancelled ? colors.textSubtle : colors.warning
  const bg = filled ? colors.positiveSubtle : cancelled ? colors.bgSubtle : colors.warningSubtle
  const icon = filled ? 'solar:check-circle-bold' : cancelled ? 'solar:close-circle-bold' : 'solar:clock-circle-bold'
  const side = order.side === 'BUY' ? 'buy' : 'sell'
  const qty = order.filledQty || order.requestedQty

  const headline = filled
    ? 'Your order was executed in full.'
    : cancelled
      ? 'This order was cancelled and did not execute.'
      : 'Your order is with the exchange and has not filled yet.'

  const detail = filled
    ? 'The shares are now in your portfolio and the cash has been debited. See the receipt for the full price and fee breakdown.'
    : cancelled
      ? 'No shares changed hands and no charges apply for a cancelled order.'
      : 'It will fill automatically as soon as the market can match it. Nothing has been charged yet.'

  const reasons = [
    'The NGX is closed. It trades on weekdays, roughly 9:00am to 2:30pm WAT.',
    'This is a limit order and its price has not been reached.',
    'There is not enough matching volume in the market right now.',
  ]

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Row align="center" style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={iconBtn()}>
          <Icon name="solar:alt-arrow-left-linear" size={20} color={colors.text} />
        </Pressable>
      </Row>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing['3xl'] }} showsVerticalScrollIndicator={false}>
        {/* Status hero */}
        <View style={{ alignItems: 'center', marginTop: spacing.md }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} size={32} color={color} />
          </View>
          <Text variant="h1" align="center" style={{ marginTop: spacing.lg }}>Order {label.toLowerCase()}</Text>
          <Text variant="body" tone="muted" align="center" style={{ marginTop: spacing.sm, maxWidth: 340 }}>{headline}</Text>
        </View>

        {/* What was traded */}
        <View style={[card(), { marginTop: spacing['2xl'] }]}>
          <Row gap="md" align="center">
            <StockLogo symbol={order.secId} size={44} />
            <View style={{ flex: 1 }}>
              <Text variant="h3">{order.secId}</Text>
              <Text variant="small" tone="muted">{side} {qty.toLocaleString()} {qty === 1 ? 'unit' : 'units'} · #{order.orderNo}</Text>
            </View>
            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: bg }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color }}>{label.toUpperCase()}</Text>
            </View>
          </Row>
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.lg }} />
          <Row justify="space-between">
            <Text variant="body" tone="muted">Order value</Text>
            <Text variant="bodyStrong">{naira(order.totalValue)}</Text>
          </Row>
        </View>

        {/* Explanation */}
        <View style={[card(), { marginTop: spacing.lg }]}>
          <Text variant="bodyStrong" style={{ marginBottom: spacing.sm }}>What this means</Text>
          <Text variant="small" tone="muted" style={{ lineHeight: 20 }}>{detail}</Text>

          {active && (
            <>
              <Text variant="bodyStrong" style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>Why it is still pending</Text>
              {reasons.map(r => (
                <Row key={r} gap="sm" align="flex-start" style={{ marginBottom: spacing.sm }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.warning, marginTop: 7 }} />
                  <Text variant="small" tone="muted" style={{ flex: 1, lineHeight: 20 }}>{r}</Text>
                </Row>
              ))}
            </>
          )}
        </View>

        {/* Actions */}
        <View style={{ marginTop: spacing['2xl'], gap: spacing.md }}>
          <Button title="View receipt" variant="secondary" onPress={() => router.push(`/receipt/${order.id}` as never)} />
          {active && (
            <Button
              title={cancelling ? 'Cancelling…' : 'Cancel this order'}
              loading={cancelling}
              onPress={async () => {
                setCancelling(true)
                try { await cancelOrder(order.id, null); toast.success('Order cancelled', `Your ${order.secId} order was cancelled.`); router.back() }
                catch (e) { toast.error('Cancel failed', (e as Error).message) }
                finally { setCancelling(false) }
              }}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const iconBtn = () => ({
  width: 40, height: 40, borderRadius: radii.pill,
  alignItems: 'center' as const, justifyContent: 'center' as const,
  backgroundColor: colors.bgSubtle,
})
const card = () => ({
  borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
  backgroundColor: colors.surface, padding: spacing.lg,
})
