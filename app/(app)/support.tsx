import { useEffect, useState } from 'react'
import { View, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { usePortfolioStore } from '@/store/portfolioStore'
import { useAuthStore } from '@/store/authStore'
import type { PacOrderListItem } from '@/lib/pacApi'
import { Text, Row, Icon } from '@/ui'
import { colors, spacing, radii } from '@/theme'
import { naira } from '@/lib/format'
import { StockLogo } from '@/components/StockLogo'
import { TAB_BAR_CLEARANCE } from '@/components/FloatingTabBar'
import { useShallow } from 'zustand/react/shallow'

type FaqItem = { q: string; a: string; action?: { label: string; href: string } }
type FaqSection = { key: string; title: string; icon: string; items: FaqItem[] }

const FAQ: FaqSection[] = [
  {
    key: 'trading', title: 'Trading & orders', icon: 'solar:chart-2-bold',
    items: [
      { q: 'Why hasn’t my order filled yet?', a: 'An order stays pending until the exchange matches it. Common reasons: the NGX is closed (it trades on weekdays, roughly 9:00am to 2:30pm WAT), a limit order’s price has not been reached, or there is not enough matching volume yet. It fills automatically once conditions are met, or you can cancel it from the order’s status page.' },
      { q: 'Market order vs limit order?', a: 'A market order executes immediately at the best available price. A limit order only executes at your chosen price or better, so it may wait, or never fill if the price is not reached.' },
      { q: 'When do my trades settle?', a: 'Nigerian equities settle on T+3, three business days after the trade. Cash from a sale becomes available to withdraw only after it clears.' },
      { q: 'What fees do I pay?', a: 'Each trade carries NGX, CSCS, SEC fees and stamp duty, plus ETICO’s brokerage commission. The full breakdown is shown on the confirmation screen before you place a trade, and on every receipt.' },
    ],
  },
  {
    key: 'funding', title: 'Funding & withdrawals', icon: 'solar:wallet-money-bold',
    items: [
      { q: 'How do I add money?', a: 'You will be given a dedicated virtual account to transfer into. The amount you fund becomes your available balance for buying stocks.' },
      { q: 'How long do withdrawals take?', a: 'Withdrawals are processed within 24 hours. You can only withdraw cash that has fully settled (see the T+3 settlement note above).' },
    ],
  },
  {
    key: 'account', title: 'Account & security', icon: 'solar:shield-user-bold',
    items: [
      { q: 'I forgot my password', a: 'No problem. Tap the button below to get a reset link by email. Open the link, choose a new password, then sign in again. If you are still signed in and simply want to change it, you can do so without being locked out.', action: { label: 'Reset my password', href: '/(auth)/reset' } },
      { q: 'How do I verify my identity (KYC)?', a: 'KYC is required by the SEC and CBN before you can trade. Have your BVN and a government ID ready, it takes about a minute. Tap below to start or finish it.', action: { label: 'Verify my identity', href: '/(auth)/kyc' } },
      { q: 'How do I change my transaction PIN?', a: 'PIN management is coming to the app soon. If you are locked out of your PIN, email us and we will help you reset it securely.' },
    ],
  },
  {
    key: 'ethical', title: 'Ethical investing', icon: 'solar:leaf-bold',
    items: [
      { q: 'What makes a stock “ethical” on ETICO?', a: 'Every stock on ETICO is ethically screened. Companies in prohibited activities such as interest based finance, alcohol and gambling are excluded. Screening is reviewed on an ongoing basis.' },
      { q: 'Can I trade non-ethical stocks?', a: 'No. ETICO is strictly ethical by design. Only screened, ethically compatible NGX equities are available.' },
    ],
  },
]

export default function SupportScreen() {
  const router = useRouter()
  const { pacOrders, loadOrders } = usePortfolioStore(useShallow((s) => ({ pacOrders: s.pacOrders, loadOrders: s.loadOrders })))
  const { pacAccountId } = useAuthStore(useShallow((s) => ({ pacAccountId: s.pacAccountId })))

  useEffect(() => { if (pacAccountId) loadOrders(pacAccountId).catch(() => {}) }, [pacAccountId])

  const recent = pacOrders.slice(0, 3)

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: TAB_BAR_CLEARANCE + spacing.lg }} showsVerticalScrollIndicator={false}>
        <Text variant="h1" align="center" style={{ marginTop: spacing.sm }}>Help &amp; Support</Text>
        <Text variant="body" tone="muted" align="center" style={{ marginTop: spacing.xs }}>
          Answers, order help, and a way to reach us.
        </Text>

        {/* Contact: email only, centered */}
        <Pressable
          onPress={() => router.push('/contact' as never)}
          style={({ pressed }) => [{
            marginTop: spacing.xl, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
            backgroundColor: colors.surface, padding: spacing.xl, alignItems: 'center',
          }, pressed && { backgroundColor: colors.bgMuted }]}
        >
          <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.accentSubtle, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="solar:letter-linear" size={22} color={colors.accentInk} />
          </View>
          <Text variant="bodyStrong" align="center" style={{ marginTop: spacing.md }}>Email support</Text>
          <Text variant="small" tone="muted" align="center" style={{ marginTop: 2 }}>Tap to see how to reach us</Text>
        </Pressable>

        {/* Recent trades */}
        <SectionHeader title="Your recent trades" />
        {recent.length === 0 ? (
          <View style={card()}>
            <Text variant="body" tone="muted" align="center">No trades yet. Once you place an order, its status and help will show here.</Text>
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {recent.map(o => (
              <OrderRow key={o.id} order={o} onPress={() => router.push(`/order-status/${o.id}` as never)} />
            ))}
            {pacOrders.length > 3 && (
              <Pressable onPress={() => router.push('/orders' as never)} style={{ paddingVertical: spacing.md, alignItems: 'center' }}>
                <Text variant="smallStrong" tone="brand">See all orders</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* FAQ */}
        <SectionHeader title="Common questions" />
        <View style={{ gap: spacing['2xl'] }}>
          {FAQ.map(section => (
            <View key={section.key}>
              <Row gap="sm" align="center" justify="center" style={{ marginBottom: spacing.md }}>
                <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: colors.brandSubtle, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={section.icon} size={16} color={colors.brand} />
                </View>
                <Text variant="h3">{section.title}</Text>
              </Row>
              <View style={card(true)}>
                {section.items.map((it, i) => (
                  <FaqRow key={it.q} item={it} last={i === section.items.length - 1} onAction={(href) => router.push(href as never)} />
                ))}
              </View>
            </View>
          ))}
        </View>

        <Text variant="small" tone="subtle" align="center" style={{ marginTop: spacing['3xl'] }}>
          Still stuck? Tap Email support above and we will get back to you.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

function OrderRow({ order, onPress }: { order: PacOrderListItem; onPress: () => void }) {
  const status = (order.orderStatus ?? 'UNKNOWN').toUpperCase()
  const filled = status === 'FILLED'
  const cancelled = status.includes('CANCEL')
  const label = filled ? 'Filled' : cancelled ? 'Cancelled' : 'Pending'
  const color = filled ? colors.positive : cancelled ? colors.textSubtle : colors.warning
  const bg = filled ? colors.positiveSubtle : cancelled ? colors.bgSubtle : colors.warningSubtle
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{
      borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
      backgroundColor: colors.surface, padding: spacing.lg,
    }, pressed && { backgroundColor: colors.bgMuted }]}>
      <Row gap="md" align="center">
        <StockLogo symbol={order.secId} size={40} />
        <View style={{ flex: 1 }}>
          <Row gap="sm" align="center">
            <Text variant="bodyStrong">{order.secId}</Text>
            <Text variant="small" tone="muted">{order.side} · {order.requestedQty} units</Text>
          </Row>
          <Text variant="small" tone="muted" style={{ marginTop: 2 }}>{naira(order.totalValue)}</Text>
        </View>
        <View>
          <Text style={{ fontSize: 10, fontWeight: '800', color, letterSpacing: 0.4 }}>{label.toUpperCase()}</Text>
        </View>
        <Icon name="solar:alt-arrow-right-linear" size={16} color={colors.textSubtle} />
      </Row>
    </Pressable>
  )
}

function FaqRow({ item, last, onAction }: { item: FaqItem; last: boolean; onAction: (href: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <View style={!last ? { borderBottomWidth: 1, borderBottomColor: colors.border } : undefined}>
      <Pressable onPress={() => setOpen(o => !o)} style={{ paddingVertical: spacing.lg, paddingHorizontal: spacing.lg }}>
        <Row justify="space-between" align="center" gap="md">
          <Text variant="bodyStrong" style={{ flex: 1 }}>{item.q}</Text>
          <Icon name={open ? 'solar:alt-arrow-down-linear' : 'solar:alt-arrow-right-linear'} size={16} color={colors.textSubtle} />
        </Row>
      </Pressable>
      {open && (
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
          <Text variant="small" tone="muted" style={{ lineHeight: 20 }}>{item.a}</Text>
          {item.action && (
            <Pressable
              onPress={() => onAction(item.action!.href)}
              style={({ pressed }) => ({
                marginTop: spacing.md, alignSelf: 'flex-start',
                paddingHorizontal: spacing.lg, height: 40, borderRadius: radii.md,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: pressed ? colors.brandPress : colors.brand,
              })}
            >
              <Text style={{ color: colors.textOnBrand, fontWeight: '800', fontSize: 13 }}>{item.action.label}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  )
}

function SectionHeader({ title }: { title: string }) {
  return <Text variant="h3" align="center" style={{ marginTop: spacing['2xl'], marginBottom: spacing.md }}>{title}</Text>
}

const card = (padded = false) => ({
  borderRadius: radii.lg,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.surface,
  overflow: 'hidden' as const,
  ...(padded ? {} : { padding: spacing.lg }),
})
