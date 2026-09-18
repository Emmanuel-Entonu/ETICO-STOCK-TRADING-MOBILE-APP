import { memo } from 'react'
import { View, Pressable } from 'react-native'
import type { PacOrderListItem } from '@/lib/pacApi'
import { Text, Row, Icon, Button } from '@/ui'
import { colors, radii, spacing } from '@/theme'
import { naira } from '@/lib/format'
import { StockLogo } from './StockLogo'

// Short, human date for an order row, e.g. "12 Sep 2026, 10:42". Empty on a
// missing/invalid timestamp so the row just omits the line.
function fmtOrderDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false })
}

// Shared order line — home (recent 3) and the full history page both use it,
// so orders read the same everywhere. Tapping opens the receipt, not the
// trade screen.
export const OrderRow = memo(function OrderRow({ order, cancelling, onCancel, onPress }: {
  order: PacOrderListItem
  cancelling?: boolean
  onCancel?: () => void
  onPress: () => void
}) {
  const orderStatus = order.orderStatus ?? 'UNKNOWN'
  const filled = orderStatus === 'FILLED'
  const cancelled = orderStatus.includes('CANCEL')
  const active = !filled && !cancelled
  const statusLabel = filled ? 'Filled' : cancelled ? 'Cancelled' : orderStatus.replace(/_/g, ' ').toLowerCase()
  const statusColor = filled ? colors.positive : cancelled ? colors.textSubtle : colors.warning
  const statusBg    = filled ? colors.positiveSubtle : cancelled ? colors.bgSubtle : colors.warningSubtle
  const buy = order.side === 'BUY'
  const dateLabel = fmtOrderDate(order.createdAt)

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{
        borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
        backgroundColor: colors.surface, padding: spacing.lg,
      }, pressed && { backgroundColor: colors.bgMuted }]}
    >
      <Row gap="md" align="center">
        <StockLogo symbol={order.secId} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Row gap="sm" align="center">
            <Text variant="bodyStrong">{order.secId}</Text>
            <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.pill, backgroundColor: buy ? colors.positiveSubtle : colors.negativeSubtle }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: buy ? colors.positive : colors.negative, letterSpacing: 0.4 }}>{order.side}</Text>
            </View>
          </Row>
          <Text variant="small" tone="muted" numberOfLines={1} style={{ marginTop: 2 }}>
            {order.requestedQty} units · #{order.orderNo}
          </Text>
          {dateLabel ? (
            <Text variant="small" tone="subtle" numberOfLines={1} style={{ marginTop: 1 }}>{dateLabel}</Text>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="bodyStrong">{naira(order.totalValue)}</Text>
          <View style={{ marginTop: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: statusBg }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: statusColor, letterSpacing: 0.4 }}>{statusLabel.toUpperCase()}</Text>
          </View>
        </View>
        <Icon name="solar:alt-arrow-right-linear" size={16} color={colors.textSubtle} />
      </Row>
      {active && onCancel && (
        <Row justify="flex-end" style={{ marginTop: spacing.md }}>
          <Button title={cancelling ? 'Cancelling…' : 'Cancel Order'} variant="secondary" size="sm" fullWidth={false} loading={cancelling} onPress={onCancel} />
        </Row>
      )}
    </Pressable>
  )
})
