import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MotiView } from 'moti'
import * as Haptics from 'expo-haptics'
import { Text, Icon, Button, Loader } from '@/ui'
import { colors, spacing } from '@/theme'
import { naira } from '@/lib/format'
import { subscribe, subscriptionStatus, type SubscribeResult } from '@/lib/eventsApi'
import { useEventsStore } from '@/store/eventsStore'
import { useAuthStore } from '@/store/authStore'

// Payment processing for an event subscription. Sends the ONE payment request
// (guarded so a re-render / remount can't send it twice), then shows the result.
// If the provider's answer is unknown it polls until the server resolves it.

// One payment request per nonce. A re-mount reuses the same promise, so the
// request is never sent twice AND the result still reaches the screen.
const inflight = new Map<string, Promise<SubscribeResult>>()
type Phase = 'processing' | 'paid' | 'failed'

export default function EventProcessingScreen() {
  const router = useRouter()
  const { event, units, nonce } = useLocalSearchParams<{ event: string; units: string; nonce: string }>()
  const eventTitle = useEventsStore((s) => s.events.find((e) => e.id === event)?.title ?? 'this offer')
  const [phase, setPhase] = useState<Phase>('processing')
  const [amount, setAmount] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const finish = (p: Phase) => {
    setPhase(p)
    Haptics.notificationAsync(p === 'paid' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {})
    // Refresh everything that depends on it: banner, event page, wallet balance.
    useEventsStore.getState().load()
    useAuthStore.getState().loadProfile()
  }

  useEffect(() => {
    if (!event || !units || !nonce) return
    let alive = true
    const poll = (id: string, tries: number) => {
      pollRef.current = setTimeout(async () => {
        try {
          const s = await subscriptionStatus(id)
          if (!alive) return
          if (s.status !== 'processing') return finish(s.status)
        } catch { /* keep polling */ }
        if (tries > 0) poll(id, tries - 1)
        else if (alive) { setMessage('This is taking longer than usual. We’ll notify you as soon as it’s confirmed.') }
      }, 5000)
    }
    let request = inflight.get(nonce)
    if (!request) {
      request = subscribe(event, Number(units))
      inflight.set(nonce, request)
    }
    request
      .then((r) => {
        if (!alive) return
        setAmount(r.amount)
        if (r.status === 'processing') poll(r.id, 36)   // ~3 minutes
        else { if (r.message) setMessage(r.message); finish(r.status) }
      })
      .catch((e) => { if (alive) { setMessage((e as Error).message); finish('failed') } })
    return () => { alive = false; if (pollRef.current) clearTimeout(pollRef.current) }
  }, [event, units, nonce])

  const n = Number(units) || 0
  const shareWord = n === 1 ? 'share' : 'shares'

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md }}>
        {phase === 'processing' ? (
          <>
            <Loader size={88} />
            <Text variant="h2" align="center">Processing your payment</Text>
            <Text variant="body" tone="muted" align="center">
              {n} {shareWord} of {eventTitle}{amount != null ? ` · ${naira(amount)}` : ''}
            </Text>
            <Text variant="small" tone="subtle" align="center">Please keep this screen open.</Text>
          </>
        ) : phase === 'paid' ? (
          <MotiView from={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ alignItems: 'center', gap: spacing.md }}>
            <Icon name="solar:check-circle-bold" size={84} color={colors.positive} />
            <Text variant="h2" align="center">Subscription successful</Text>
            <Text variant="body" tone="muted" align="center">
              You subscribed for {n} {shareWord} of {eventTitle}{amount != null ? ` (${naira(amount)})` : ''}. We’ll place your order with PAC.
            </Text>
          </MotiView>
        ) : (
          <MotiView from={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ alignItems: 'center', gap: spacing.md }}>
            <Icon name="solar:close-circle-bold" size={84} color={colors.negative} />
            <Text variant="h2" align="center">Payment didn’t go through</Text>
            <Text variant="body" tone="muted" align="center">
              {message ?? 'Nothing was taken from your wallet. Please try again.'}
            </Text>
          </MotiView>
        )}
        {phase === 'processing' && message ? <Text variant="small" tone="muted" align="center">{message}</Text> : null}
      </View>

      {phase !== 'processing' ? (
        <View style={{ gap: spacing.xs }}>
          <Button title={phase === 'paid' ? 'Done' : 'Back to offer'} onPress={() => router.back()} />
          {phase === 'paid' ? <Button title="Go to Home" variant="ghost" size="md" onPress={() => router.replace('/(app)' as never)} /> : null}
        </View>
      ) : null}
    </SafeAreaView>
  )
}
