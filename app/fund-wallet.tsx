import { useState, useRef, useEffect } from 'react'
import { View, Pressable, TextInput, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { MotiView } from 'moti'
import { useShallow } from 'zustand/react/shallow'
import { useAuthStore } from '@/store/authStore'
import { Text, Row, Button, Icon, toast } from '@/ui'
import { colors, spacing, radii, useThemedStyles } from '@/theme'
import { naira } from '@/lib/format'
import { TransactionPinModal } from '@/components/TransactionPinModal'

// Dedicated "fund wallet" page (presented as a modal). The user picks an amount
// to move from their Virtual Account into their PAC trading wallet. The app
// awaits the MyWealthCare (PAC) response end-to-end, shows a success state, then
// auto-returns to the wallet with a "balance updates soon" prompt. On failure
// the raw PAC/proxy error is MASKED behind a friendly message.
type Phase = 'input' | 'submitting' | 'success'

export default function FundWalletScreen() {
  const router = useRouter()
  const styles = useThemedStyles(makeStyles)

  const { vaAvailable, fundWalletFromVa } = useAuthStore(useShallow(s => ({
    vaAvailable: s.vaAvailable,
    fundWalletFromVa: s.fundWalletFromVa,
  })))

  const [amount, setAmount] = useState('')
  const [phase, setPhase] = useState<Phase>('input')
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [pinOpen, setPinOpen] = useState(false)
  // Auto-return timer — cleared on unmount so router.back() can't fire on a
  // torn-down screen (stray navigation on iOS).
  const returnTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (returnTimer.current) clearTimeout(returnTimer.current) }, [])

  const amt = Math.round(Number(amount) * 100) / 100
  const valid = Number.isFinite(amt) && amt >= 0.01 && amt <= vaAvailable

  // Validate, then gate the funding behind the transaction PIN — the same PIN
  // that authorizes every trade. Moving money out of the VA requires it.
  const onConfirm = () => {
    if (!valid) {
      setErrMsg(amt > vaAvailable ? `You only have ${naira(vaAvailable)} available.` : 'Enter an amount to send.')
      return
    }
    setErrMsg(null)
    setPinOpen(true)
  }

  // Runs only after the PIN is verified. Waits for the PAC response, shows the
  // success state, then auto-returns to the wallet. Masks any raw error.
  const doFund = async () => {
    setPinOpen(false)
    setPhase('submitting')
    try {
      await fundWalletFromVa(amt)
      setPhase('success')
      returnTimer.current = setTimeout(() => {
        returnTimer.current = null
        toast.success('On its way', 'Your wallet balance will update shortly. No need to refresh.')
        router.back()
      }, 1200)
    } catch (e) {
      // Mask the raw error — never surface PAC/proxy internals to the user.
      console.warn('[fund-wallet] failed:', (e as Error).message)
      setPhase('input')
      setErrMsg("We couldn't complete that right now. Please try again in a moment.")
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* Header */}
        <Row align="center" justify="space-between" style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm }}>
          <Text variant="h2">Fund trading account</Text>
          {phase !== 'success' && (
            <Pressable onPress={() => router.back()} hitSlop={12} disabled={phase === 'submitting'} style={styles.closeBtn}>
              <Icon name="solar:close-square-linear" size={22} color={phase === 'submitting' ? colors.textSubtle : colors.text} />
            </Pressable>
          )}
        </Row>

        {phase === 'success' ? (
          <View style={styles.center}>
            <MotiView
              from={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 13, stiffness: 180 }}
              style={styles.checkCircle}
            >
              <Icon name="solar:check-read-bold" size={44} color={colors.textOnBrand} />
            </MotiView>
            <Text variant="h2" style={{ marginTop: spacing.xl }}>Sent</Text>
            <Text variant="body" tone="muted" align="center" style={{ marginTop: spacing.sm, paddingHorizontal: spacing.xl }}>
              {naira(amt)} is moving into your trading account.
            </Text>
          </View>
        ) : (
          <View style={{ flex: 1, paddingHorizontal: spacing.xl }}>
            <Text variant="small" tone="muted" style={{ marginTop: spacing.xs }}>
              Move money from your wallet into your trading account, which is your buying power on the exchange.
            </Text>

            <Row align="center" justify="space-between" style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>
              <Text variant="small" tone="muted">Available to move</Text>
              <Text variant="smallStrong">{naira(vaAvailable)}</Text>
            </Row>

            <View style={styles.amountRow}>
              <Text style={styles.naira}>₦</Text>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={(t) => { setAmount(t.replace(/[^0-9.]/g, '')); if (errMsg) setErrMsg(null) }}
                placeholder="0"
                placeholderTextColor={colors.textSubtle}
                keyboardType="decimal-pad"
                autoFocus
                editable={phase === 'input'}
              />
              <Pressable onPress={() => setAmount(String(vaAvailable))} hitSlop={8} style={styles.maxBtn}>
                <Text variant="smallStrong" tone="brand">MAX</Text>
              </Pressable>
            </View>
            {errMsg ? <Text variant="small" tone="negative" style={{ marginTop: spacing.md }}>{errMsg}</Text> : null}

            <View style={{ flex: 1 }} />
            <Button
              title={phase === 'submitting' ? 'Moving money…' : valid ? `Move ${naira(amt)} to trading account` : 'Enter an amount'}
              onPress={onConfirm}
              loading={phase === 'submitting'}
              disabled={phase === 'submitting' || !valid}
            />
            <View style={{ height: spacing.xl }} />
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Transaction PIN gate — same as trades. */}
      <TransactionPinModal
        visible={pinOpen}
        submitting={phase === 'submitting'}
        title="Confirm funding"
        subtitle={`Enter your PIN to move ${naira(amt)} into your trading account`}
        onVerified={doFund}
        onCancel={() => setPinOpen(false)}
      />
    </SafeAreaView>
  )
}

const makeStyles = () => StyleSheet.create({
  closeBtn: {
    width: 40, height: 40, borderRadius: radii.pill,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bgSubtle,
  },
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: spacing['4xl'],
  },
  checkCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: colors.positive,
    alignItems: 'center', justifyContent: 'center',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
  },
  naira: {
    fontSize: 26, lineHeight: 34, fontWeight: '900', color: colors.textMuted, marginRight: spacing.sm,
  },
  input: {
    flex: 1, fontSize: 30, fontWeight: '900', color: colors.text, paddingVertical: spacing.lg,
  },
  maxBtn: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radii.pill, backgroundColor: colors.brandSubtle,
  },
})
