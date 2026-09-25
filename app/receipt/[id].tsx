import { View, ScrollView, Pressable, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import Svg, { Path } from 'react-native-svg'
import { usePortfolioStore } from '@/store/portfolioStore'
import { Text, Button, Row, Icon } from '@/ui'
import { colors, spacing, radii } from '@/theme'
import { naira } from '@/lib/format'
import { EticoLogo } from '@/components/EticoMark'
import { StockLogo } from '@/components/StockLogo'

function ZigZag() {
  const { width } = useWindowDimensions()
  const w = width - spacing.xl * 2
  const step = 12
  const h = 6
  let d = `M0 ${h}`
  for (let x = 0; x < w; x += step) d += ` L${x + step / 2} 0 L${x + step} ${h}`
  return (
    <Svg width={w} height={h} style={{ marginVertical: spacing.xl }}>
      <Path d={d} stroke={colors.border} strokeWidth={1.5} fill="none" />
    </Svg>
  )
}

function fmtDate(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const date = d.toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' })
  const time = d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${date} | ${time}`
}

export default function ReceiptScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const order = usePortfolioStore((s) => s.pacOrders.find((o) => o.id === id))

  if (!order) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
          <Text variant="h3">Receipt unavailable</Text>
          <Text variant="body" tone="muted" align="center" style={{ marginTop: spacing.sm }}>
            We couldn’t find this order. Pull to refresh your orders and try again.
          </Text>
          <Button title="Go back" variant="secondary" onPress={() => router.back()} style={{ marginTop: spacing.xl }} />
        </View>
      </SafeAreaView>
    )
  }

  const status = order.orderStatus ?? 'UNKNOWN'
  const filled = status === 'FILLED'
  const cancelled = status.includes('CANCEL')
  const statusLabel = filled ? 'Filled' : cancelled ? 'Cancelled' : status.replace(/_/g, ' ')
  const statusIcon = filled ? 'solar:check-circle-bold' : cancelled ? 'solar:close-circle-bold' : 'solar:clock-circle-bold'
  const statusColor = filled ? colors.positive : cancelled ? colors.negative : colors.warning
  const buy = order.side === 'BUY'
  const qty = order.filledQty || order.requestedQty
  const pricePerShare = order.filledQty > 0
    ? order.consideration / order.filledQty
    : order.limitPrice ?? (order.requestedQty > 0 ? order.consideration / order.requestedQty : 0)

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Row justify="space-between" align="center" style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ width: 40, height: 40, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSubtle }}>
          <Icon name="solar:close-square-linear" size={20} color={colors.text} />
        </Pressable>
        <Text variant="eyebrow" tone="muted">RECEIPT</Text>
        <View style={{ width: 40 }} />
      </Row>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing['3xl'] }} showsVerticalScrollIndicator={false}>
        {/* Brand lockup */}
        <View style={{ alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing['2xl'] }}>
          <EticoLogo size={84} />
        </View>

        {/* Status */}
        <View style={{ alignItems: 'center' }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.bgSubtle, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md }}>
            <Icon name={statusIcon} size={32} color={statusColor} />
          </View>
          <Text variant="h2" style={{ color: statusColor }}>{statusLabel}</Text>
          <Text variant="small" tone="muted" style={{ marginTop: spacing.xs }}>{fmtDate(order.createdAt)}</Text>
          <Text variant="small" tone="subtle" style={{ marginTop: 2 }}>ORDER #{order.orderNo}</Text>
        </View>

        <ZigZag />

        {/* What was traded */}
        <Row gap="md" align="center">
          <StockLogo symbol={order.secId} size={48} />
          <View style={{ flex: 1 }}>
            <Text variant="h3">{order.secId}</Text>
            <Text variant="small" tone="muted">{buy ? 'Bought' : 'Sold'} {qty.toLocaleString()} {qty === 1 ? 'unit' : 'units'}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 12, fontWeight: '800', color: buy ? colors.positive : colors.negative }}>{order.side}</Text>
          </View>
        </Row>

        {/* Breakdown */}
        <View style={{ marginTop: spacing.xl }}>
          <ReceiptLine label="Price per share" value={naira(pricePerShare)} />
          <ReceiptLine label="Quantity" value={qty.toLocaleString()} />
          <ReceiptLine label="Consideration" value={naira(order.consideration)} />
          <ReceiptLine label="Commission" value={naira(order.commission)} />
          <ReceiptLine label="Fees & levies" value={naira(order.fees)} />
        </View>

        <ZigZag />

        <Row justify="space-between" align="center">
          <Text variant="bodyStrong">Total {buy ? 'paid' : 'received'}</Text>
          <Text variant="h2" style={{ color: colors.accentInk }}>{naira(order.totalValue)}</Text>
        </Row>

        <View style={{ marginTop: spacing['2xl'], gap: spacing.sm }}>
          <MetaLine label="Market" value={order.marketCode || 'NGX'} />
          <MetaLine label="Currency" value={order.currency || 'NGN'} />
          <MetaLine label="Order status" value={statusLabel} />
        </View>

        <Button title="Done" onPress={() => router.back()} style={{ marginTop: spacing['2xl'] }} />
      </ScrollView>
    </SafeAreaView>
  )
}

function ReceiptLine({ label, value }: { label: string; value: string }) {
  return (
    <Row justify="space-between" align="center" style={{ paddingVertical: spacing.sm }}>
      <Text variant="body" tone="muted">{label}</Text>
      <Text variant="bodyStrong">{value}</Text>
    </Row>
  )
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <Row justify="space-between" align="center">
      <Text variant="small" tone="subtle">{label}</Text>
      <Text variant="smallStrong">{value}</Text>
    </Row>
  )
}
