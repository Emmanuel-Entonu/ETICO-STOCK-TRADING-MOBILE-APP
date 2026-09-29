import { useEffect, useMemo, useState } from 'react'
import { View, ScrollView, Pressable, Linking, RefreshControl } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { useShallow } from 'zustand/react/shallow'
import { Text, Icon, Button, Notice, Skeleton } from '@/ui'
import { colors, spacing, radii } from '@/theme'
import { naira } from '@/lib/format'
import { isOpen, totalFor, unitPrice, unitsHeld } from '@/lib/eventsApi'
import { useEventsStore } from '@/store/eventsStore'
import { useAuthStore } from '@/store/authStore'
import { EventLogo } from '@/components/EventBanner'
import { TransactionPinModal } from '@/components/TransactionPinModal'

// One event (e.g. the Dangote IPO). The user only picks how many shares:
// the total is shares × unit price (same integer maths as the server), paid
// from their wallet. Everything PAC needs is taken from their profile on the
// server when the wallet is debited.
export default function EventScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { events, subs, loaded, loading, load } = useEventsStore(useShallow((s) => ({
    events: s.events, subs: s.subs, loaded: s.loaded, loading: s.loading, load: s.load,
  })))
  const { cacsStatus, vaAvailable, vaNumber, loadProfile } = useAuthStore(useShallow((s) => ({
    cacsStatus: s.cacsStatus, vaAvailable: s.vaAvailable, vaNumber: s.vaNumber, loadProfile: s.loadProfile,
  })))
  useEffect(() => { load(); loadProfile() }, [load, loadProfile])

  const event = events.find((e) => e.id === id)
  const mine = useMemo(() => subs.filter((s) => s.event_id === id), [subs, id])
  const held = unitsHeld(mine)
  const limit = event?.max_units_per_user ?? 0
  const remaining = Math.max(0, limit - held)
  const done = !!event && held >= limit

  const [units, setUnits] = useState(1)
  useEffect(() => { setUnits((u) => Math.min(Math.max(1, u), Math.max(1, remaining))) }, [remaining])
  const [pinOpen, setPinOpen] = useState(false)

  if (!loaded) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.lg }}>
        <Skeleton width={40} height={40} radius={20} />
        <Skeleton height={180} radius={radii.lg} />
        <Skeleton height={120} radius={radii.lg} />
      </SafeAreaView>
    )
  }
  if (!event) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md }}>
        <Text variant="bodyStrong">This event isn’t available.</Text>
        <Button title="Back" fullWidth={false} onPress={() => router.back()} />
      </SafeAreaView>
    )
  }

  const price = unitPrice(event)
  const total = totalFor(event, units)
  const wallet = vaAvailable ?? 0
  const open = isOpen(event)
  const approved = cacsStatus === 'approved'
  const ready = !!event.collection_va_number
  const isCollector = !!vaNumber && vaNumber === event.collection_va_number
  const short = total > wallet

  const step = (d: number) => {
    const next = Math.min(remaining, Math.max(1, units + d))
    if (next !== units) { setUnits(next); Haptics.selectionAsync().catch(() => {}) }
  }

  const onVerified = () => {
    setPinOpen(false)
    // The processing page makes the (single) payment request.
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    router.push({ pathname: '/events/processing', params: { event: event.id, units: String(units), nonce } } as never)
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSubtle }}>
          <Icon name="solar:alt-arrow-left-linear" size={20} color={colors.text} />
        </Pressable>
        <Text variant="h2" numberOfLines={1} style={{ flex: 1 }}>Event</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing['3xl'], gap: spacing.lg }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { load(); loadProfile() }} tintColor={colors.brand} />}
      >
        {/* Offer card (modelled on PAC's public-offers card) */}
        <View style={{ padding: spacing.lg, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <EventLogo event={event} size={52} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="h3">{event.title}</Text>
              <Text variant="eyebrow" tone="brand" style={{ marginTop: 4 }}>{event.kind === 'ipo' ? 'PRIMARY OFFER' : 'EVENT'}</Text>
            </View>
          </View>
          {event.summary ? <Text variant="small" tone="muted" style={{ marginTop: spacing.md, lineHeight: 20 }}>{event.summary}</Text> : null}
          <View style={{ marginTop: spacing.md, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.bgSubtle, gap: spacing.sm }}>
            <InfoRow label="Unit price" value={naira(price)} />
            {event.closes_at ? <InfoRow label="Closing date" value={new Date(event.closes_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })} /> : null}
            <InfoRow label="Your limit" value={`${limit} shares`} />
            <InfoRow label="You’ve subscribed" value={`${held} of ${limit}`} />
          </View>
        </View>

        {/* State: success / not eligible / not ready / closed / buy */}
        {done ? (
          <Notice tone="success" title="You’re subscribed" body={`You’ve subscribed for ${held} shares of ${event.title}, your full limit. We’ll place your order with PAC.`} />
        ) : !open ? (
          <Notice tone="info" title={event.status === 'upcoming' ? 'Opens soon' : 'This offer is closed'} body={event.status === 'upcoming' ? 'Check back when subscriptions open.' : 'Subscriptions for this offer have ended.'} />
        ) : !approved ? (
          <Notice
            tone="warning"
            title="Finish verification to join"
            body="Only verified accounts can subscribe. Complete your KYC; once your account is approved you can subscribe here."
          />
        ) : isCollector ? (
          <Notice tone="info" title="This account collects the payments" body="Subscribers’ payments for this offer are sent to your wallet account, so it can’t subscribe to it." />
        ) : !ready ? (
          <Notice tone="info" title="Payments open shortly" body="This offer will start accepting subscriptions very soon." />
        ) : (
          <View style={{ padding: spacing.lg, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
            <Text variant="eyebrow" tone="muted">HOW MANY SHARES?</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md }}>
              <Pressable onPress={() => step(-1)} disabled={units <= 1} hitSlop={10} accessibilityLabel="One fewer share" style={{ opacity: units <= 1 ? 0.35 : 1 }}>
                <Icon name="solar:minus-circle-linear" size={40} color={colors.brand} />
              </Pressable>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 40, lineHeight: 46, fontWeight: '800', color: colors.text }}>{units}</Text>
                <Text variant="small" tone="muted">{units === 1 ? 'share' : 'shares'} · up to {remaining}</Text>
              </View>
              <Pressable onPress={() => step(1)} disabled={units >= remaining} hitSlop={10} accessibilityLabel="One more share" style={{ opacity: units >= remaining ? 0.35 : 1 }}>
                <Icon name="solar:add-circle-linear" size={40} color={colors.brand} />
              </Pressable>
            </View>

            <View style={{ marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm }}>
              <InfoRow label={`${units} × ${naira(price)}`} value={naira(total)} strong />
              <InfoRow label="Paid from your wallet" value={`${naira(wallet)} available`} />
            </View>

            {short ? (
              <Notice
                tone="error"
                icon="solar:wallet-money-bold"
                title="Not enough in your wallet"
                body={`You need ${naira(total - wallet)} more. Load your wallet, then come back to subscribe.`}
                action={{ label: 'Load wallet', onPress: () => router.push('/wallet' as never) }}
                style={{ marginTop: spacing.lg }}
              />
            ) : (
              <View style={{ marginTop: spacing.lg }}>
                <Button title={`Subscribe · ${naira(total)}`} onPress={() => setPinOpen(true)} />
                <Text variant="small" tone="subtle" align="center" style={{ marginTop: spacing.sm }}>
                  Your details are sent with your order automatically. Nothing to fill in.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Your payments for this event */}
        {mine.length > 0 ? (
          <View>
            <Text variant="eyebrow" tone="muted" style={{ marginBottom: spacing.sm }}>YOUR SUBSCRIPTIONS</Text>
            <View style={{ borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' }}>
              {mine.map((s, i) => (
                <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                  <Icon
                    name={s.status === 'paid' ? 'solar:check-circle-bold' : s.status === 'failed' ? 'solar:close-circle-bold' : 'solar:clock-circle-bold'}
                    size={20}
                    color={s.status === 'paid' ? colors.positive : s.status === 'failed' ? colors.negative : colors.warning}
                  />
                  <View style={{ flex: 1 }}>
                    <Text variant="smallStrong">{s.units} {s.units === 1 ? 'share' : 'shares'} · {naira(s.amount_kobo / 100)}</Text>
                    <Text variant="small" tone="muted">
                      {new Date(s.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })} ·{' '}
                      {s.status === 'paid' ? 'Paid' : s.status === 'failed' ? 'Failed, refunded to your wallet' : 'Processing'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Offer documents */}
        {event.docs?.length ? (
          <View>
            <Text variant="eyebrow" tone="muted" style={{ marginBottom: spacing.sm }}>OFFER DOCUMENTS</Text>
            {event.docs.map((d) => (
              <Pressable key={d.url} onPress={() => Linking.openURL(d.url)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}>
                <Icon name="solar:document-text-linear" size={18} color={colors.brand} />
                <Text variant="smallStrong" tone="brand" style={{ flex: 1 }}>{d.title}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <TransactionPinModal
        visible={pinOpen}
        submitting={false}
        title="Confirm subscription"
        subtitle={`Enter your PIN to pay ${naira(total)} for ${units} ${units === 1 ? 'share' : 'shares'}`}
        onVerified={onVerified}
        onCancel={() => setPinOpen(false)}
      />
    </SafeAreaView>
  )
}

function InfoRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text variant="small" tone="muted">{label}</Text>
      <Text variant={strong ? 'bodyStrong' : 'smallStrong'}>{value}</Text>
    </View>
  )
}
