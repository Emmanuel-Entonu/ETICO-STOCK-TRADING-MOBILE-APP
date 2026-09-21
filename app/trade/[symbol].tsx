import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Pressable, ScrollView, StyleSheet, Modal, TextInput, KeyboardAvoidingView, Platform, Alert, BackHandler } from 'react-native'
import { BlurView } from 'expo-blur'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { usePortfolioStore } from '@/store/portfolioStore'
import { useAuthStore } from '@/store/authStore'
import { usePinStore } from '@/store/pinStore'
import { useWatchlistStore } from '@/store/watchlistStore'
import { validateOrder, getSecurityData, type PacValidationResult, type PacMarketData } from '@/lib/pacApi'
import { validateQuantity, validatePrice, validateSymbol } from '@/lib/validation'
import { Text, Row, Stack, Card, Button, Divider, OptionGroup, Icon, toast, Loader } from '@/ui'
import { colors, radii, spacing, typography, useThemedStyles } from '@/theme'
import { naira, pct } from '@/lib/format'
import { StockLogo } from '@/components/StockLogo'
import { EticoMark } from '@/components/EticoMark'
import { notifyTrade } from '@/lib/pushNotifications'
import { PriceChart } from '@/components/PriceChart'
import { TransactionPinModal } from '@/components/TransactionPinModal'

type Side = 'BUY' | 'SELL'
type OrderType = 'MARKET' | 'LIMIT'

export default function TradeScreen() {
  const styles = useThemedStyles(makeStyles)
  const { symbol: rawSymbol, from } = useLocalSearchParams<{ symbol: string; from?: string }>()
  const symbolCheck = validateSymbol(rawSymbol ?? '')
  const symbol = symbolCheck.ok ? symbolCheck.value : ''
  const router = useRouter()

  // Prefer native modal dismiss (router.back) — it triggers the smooth
  // slide-down animation and preserves the underlying tab state. `?from=`
  // is a fallback for cold-start deep links where no back-stack exists.
  // Previously we always did router.replace(from) which forced a full
  // teardown + build cycle and made close feel choppy.
  const goBack = useCallback(() => {
    if (router.canGoBack()) { router.back(); return }
    if (from) { router.replace(from as never); return }
    router.replace('/(app)')
  }, [from, router])

  // iOS can only present ONE modal at a time: opening a <Modal> while another is
  // still dismissing silently no-ops (this made "confirm buy" do nothing on iOS
  // — the PIN sheet never appeared). So when moving between the order-sheet →
  // confirm → legal → PIN modals, close the current one and open the next only
  // after its dismiss animation finishes. Android stacks fine, so open at once.
  const transitionModal = useCallback((close: () => void, open: () => void) => {
    close()
    if (Platform.OS === 'ios') setTimeout(open, 450)
    else open()
  }, [])
  const { marketData, positions, orderLoading, orderResult, placeOrder, clearOrderResult, loadMarketData, loadAccount } = usePortfolioStore()
  const { pacAccountId, kycStatus, cacsStatus, walletBalance, user, refreshWalletBalance } = useAuthStore()
  const unlocked = usePinStore((s) => s.unlockedThisSession)
  const insets = useSafeAreaInsets()

  const watched = useWatchlistStore(s => s.symbols.includes((symbol ?? '').toUpperCase()))
  const toggleWatch = useWatchlistStore(s => s.toggle)
  const loadWatch = useWatchlistStore(s => s.load)
  useEffect(() => { loadWatch() }, [])

  const [side, setSide] = useState<Side>('BUY')
  const [orderType, setOrderType] = useState<OrderType>('MARKET')
  const [quantity, setQuantity] = useState('')
  const [limitPrice, setLimitPrice] = useState('')
  const [orderSheetOpen, setOrderSheetOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [legalOpen, setLegalOpen] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [validation, setValidation] = useState<PacValidationResult | null>(null)
  const [validating, setValidating] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<{ side: Side; qty: number; total: number; orderNo?: string | null } | null>(null)
  const pendingRef = useRef<{ side: Side; qty: number; total: number } | null>(null)
  // Stable per-intent idempotency key. Regenerated only when the user opens
  // a fresh confirm sheet; a retry of the same intent reuses it so PAC dedups.
  const idempotencyRef = useRef<string | null>(null)
  const [fetchedStock, setFetchedStock] = useState<PacMarketData | null>(null)
  const [stockLoading, setStockLoading] = useState(false)
  const [stockError, setStockError] = useState<string | null>(null)

  // Android hardware/gesture back bypasses the on-screen close button and, when
  // there's no back-stack (e.g. a cold-start deep link, or an edge case where
  // this modal ended up as the root), react-navigation would finish the
  // activity and close the whole app. Intercept it: close whatever overlay is
  // on top first (deepest first), and only fall through to goBack — which
  // always resolves to the market/home screen — when the base screen is bare.
  // A deterministic fallback that also covers overlays whose own onRequestClose
  // doesn't fire; when a <Modal>'s handler consumes the press first, this
  // simply never runs.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (pinOpen)        { setPinOpen(false); return true }
      if (legalOpen)      { setLegalOpen(false); return true }
      if (confirmOpen)    { setConfirmOpen(false); return true }
      if (receipt)        { setReceipt(null); setQuantity(''); return true }
      if (orderSheetOpen) { setOrderSheetOpen(false); return true }
      goBack()
      return true
    })
    return () => sub.remove()
  }, [pinOpen, legalOpen, confirmOpen, receipt, orderSheetOpen, goBack])

  useEffect(() => { if (marketData.length === 0) loadMarketData() }, [])
  useEffect(() => () => { clearOrderResult() }, [])

  useEffect(() => {
    if (!symbol) return
    if (marketData.find(s => s.symbol === symbol)) return
    let cancelled = false
    setStockLoading(true); setStockError(null)
    getSecurityData(symbol)
      .then(data => { if (!cancelled) setFetchedStock(data) })
      .catch(e => { if (!cancelled) setStockError((e as Error).message) })
      .finally(() => { if (!cancelled) setStockLoading(false) })
    return () => { cancelled = true }
  }, [symbol, marketData.length])

  useEffect(() => {
    if (orderResult?.success && pendingRef.current) {
      const done = pendingRef.current
      setReceipt({ ...done, orderNo: orderResult.orderId })
      // The wallet mirrors the live PAC cash balance. The order just moved PAC
      // cash (a BUY spends, a SELL returns proceeds on settlement), so re-pull
      // the balance from PAC rather than hand-editing a separate ledger.
      // Use a blocking Alert on failure so the error can't be lost behind the
      // receipt sheet / navigation.
      ;(async () => {
        try {
          await refreshWalletBalance()
        } catch (e) {
          Alert.alert('Wallet not updated', String((e as Error).message))
        }
      })()
      // System-tray notification so the user sees the confirmation even after
      // leaving the app.
      notifyTrade({ side: done.side, symbol, qty: done.qty, total: done.total, orderId: orderResult.orderId })
      pendingRef.current = null
      setConfirmOpen(false)
      clearOrderResult()
    } else if (orderResult && !orderResult.success) {
      toast.error('Order failed', orderResult.message)
      clearOrderResult()
    }
  }, [orderResult])

  const holding = positions.find(p => p.symbol === symbol)
  const stock =
    marketData.find(s => s.symbol === symbol)
    ?? fetchedStock
    ?? (holding ? {
      symbol: holding.symbol,
      name: holding.securityName || holding.symbol,
      price: holding.currentPrice,
      change: 0,
      changePercent: 0,
      volume: 0,
      high: 0,
      low: 0,
      open: 0,
    } : null)

  const maxSellQty = holding?.quantity ?? 0
  const qtyCheck = validateQuantity(quantity, side === 'SELL' && maxSellQty > 0 ? maxSellQty : 10_000_000)
  const qty = qtyCheck.ok ? qtyCheck.value : 0
  const qtyError = quantity && !qtyCheck.ok ? qtyCheck.error : null

  const limitCheck = orderType === 'LIMIT' && limitPrice
    ? validatePrice(limitPrice, { min: 0.01, max: 1_000_000 })
    : null
  const limitPriceError = limitCheck && !limitCheck.ok ? limitCheck.error : null

  const stockPrice = stock?.price ?? 0
  const effectivePrice = limitCheck?.ok ? limitCheck.value : stockPrice
  const estimatedTotal = effectivePrice * qty
  const orderTotal = validation?.totalValue ?? estimatedTotal
  // Buying power = the live PAC account cash balance, mirrored into walletBalance.
  // Funding the VA deposits into the user's own PAC account; this is that balance.
  const walletCash = walletBalance
  const sellQtyInvalid = side === 'SELL' && qty > maxSellQty
  const sellNoHolding  = side === 'SELL' && maxSellQty === 0
  const insufficientCash = side === 'BUY' && walletCash < orderTotal

  const canConfirm =
    !!pacAccountId
    && kycStatus === 'verified'
    && cacsStatus === 'approved'
    && qtyCheck.ok
    && (orderType === 'MARKET' || !!limitCheck?.ok)
    && !sellQtyInvalid && !sellNoHolding && !insufficientCash

  const isUp = (stock?.changePercent ?? 0) >= 0

  useEffect(() => {
    if (!confirmOpen || !pacAccountId || qty <= 0 || !stock) return
    let cancelled = false
    setValidating(true); setValidation(null); setValidationError(null)
    // Refresh wallet balance whenever the confirm sheet opens so we don't
    // race a debit that landed via another flow (fee, second trade,
    // reversal). Fire-and-forget; the validation call below is the
    // authoritative check.
    loadAccount(pacAccountId).catch(() => {})
    validateOrder({
      accountId: pacAccountId,
      symbol: stock.symbol,
      side,
      quantity: qty,
      orderType,
      limitPrice: orderType === 'LIMIT' ? effectivePrice : undefined,
    })
      .then(v => { if (!cancelled) setValidation(v) })
      .catch(e => { if (!cancelled) setValidationError((e as Error).message) })
      .finally(() => { if (!cancelled) setValidating(false) })
    return () => { cancelled = true }
  }, [confirmOpen])

  // Deep-link PIN gate. `/trade/[symbol]` is at the root Stack, not under
  // (app), so it can render before AuthGate's redirect completes on
  // cold-start via a `moneta:///trade/AAA` deep link. Refuse to render any
  // trade UI until a real session is unlocked.
  if (!user || !unlocked) return null

  if (!stock) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', gap: 16, padding: spacing.xl }}>
        {stockLoading ? (
          <>
            <Loader size={28} />
            <Text variant="body" tone="muted">Loading {symbol}…</Text>
          </>
        ) : stockError ? (
          <>
            <Text variant="body" tone="negative" align="center" selectable>Could not load {symbol}: {stockError}</Text>
            <Button title="Back" onPress={goBack} fullWidth={false} />
          </>
        ) : (
          <>
            <Text variant="body" tone="muted">Security not found.</Text>
            <Button title="Back to Market" onPress={() => router.replace('/(app)/market')} fullWidth={false} />
          </>
        )}
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Sticky header with close + logo + ticker + owned pill */}
      <Row justify="space-between" align="center" style={{ paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={goBack} hitSlop={12} style={styles.iconButton}>
          <Icon name="solar:close-square-linear" size={20} color={colors.text} />
        </Pressable>
        <Row gap="sm" align="center">
          <StockLogo symbol={stock.symbol} size={28} />
          <View>
            <Text variant="bodyStrong" style={{ fontSize: 15 }}>{stock.symbol}</Text>
            <Text variant="small" tone="muted" numberOfLines={1} style={{ maxWidth: 180 }}>{stock.name}</Text>
          </View>
        </Row>
        <Pressable
          onPress={async () => { try { await toggleWatch(stock.symbol) } catch (e) { toast.error('Watchlist', (e as Error).message) } }}
          hitSlop={12}
          style={styles.iconButton}
        >
          <Icon name={watched ? 'solar:star-bold' : 'solar:star-linear'} size={20} color={watched ? colors.accent : colors.textMuted} />
        </Pressable>
      </Row>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {/* Price hero */}
        <Row justify="space-between" align="flex-start">
          <View style={{ flex: 1 }}>
            <Text variant="eyebrow" tone="muted">LAST TRADED</Text>
            <Text variant="display" style={{ marginTop: spacing.sm }}>{naira(stock.price)}</Text>
            <Row gap="sm" style={{ marginTop: spacing.sm }}>
              <View style={changePillStyle(isUp)}>
                <Icon name={isUp ? 'solar:arrow-up-bold' : 'solar:arrow-down-bold'} size={12} color={isUp ? colors.positive : colors.negative} />
                <Text style={{ fontSize: 12, fontWeight: '800', color: isUp ? colors.positive : colors.negative, marginLeft: 4 }}>
                  {isUp ? '+' : ''}₦{Math.abs(stock.change).toFixed(2)}
                </Text>
              </View>
              <View style={changePillStyle(isUp)}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: isUp ? colors.positive : colors.negative }}>
                  {pct(stock.changePercent)}
                </Text>
              </View>
              <Text variant="small" tone="subtle">today</Text>
            </Row>
          </View>
          {holding && (
            <View style={ownedPillStyle}>
              <Icon name="solar:bag-check-bold" size={12} color={colors.brand} />
              <Text style={{ fontSize: 11, fontWeight: '800', color: colors.brand, marginLeft: 4 }}>{holding.quantity} owned</Text>
            </View>
          )}
        </Row>

        {/* Price chart — enlarged now that the OHLV strip is gone */}
        <View style={{ marginTop: spacing.xl }}>
          <PriceChart symbol={stock.symbol} price={stock.price} isUp={isUp} height={340} />
        </View>
      </ScrollView>

      {/* Sticky Buy / Sell bar — hidden while the order sheet is open so it
          doesn't peek out beneath the sheet. */}
      {!orderSheetOpen && (
        <View style={[styles.tradeBar, { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.sm }]}>
          <View style={{ flex: 1 }}>
            <Button title="Buy" variant="primary" onPress={() => { Haptics.selectionAsync().catch(() => {}); setSide('BUY'); setOrderSheetOpen(true) }} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Sell" variant="secondary" onPress={() => { Haptics.selectionAsync().catch(() => {}); setSide('SELL'); setOrderSheetOpen(true) }} />
          </View>
        </View>
      )}

      {/* Order-entry bottom sheet */}
      <Modal visible={orderSheetOpen} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setOrderSheetOpen(false)}>
        <View style={styles.orderRoot}>
          <Pressable style={styles.orderBackdrop} onPress={() => setOrderSheetOpen(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.orderSheet, { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.lg }]}>
            <View style={styles.orderHandle} />
            <Row justify="space-between" align="center" style={{ marginBottom: spacing.lg }}>
              <Text variant="h2">{side === 'BUY' ? 'Buy' : 'Sell'} {stock.symbol}</Text>
              <Pressable onPress={() => setOrderSheetOpen(false)} hitSlop={10} style={styles.iconButton}>
                <Icon name="solar:close-square-linear" size={20} color={colors.text} />
              </Pressable>
            </Row>

              <Stack gap="lg">
                {/* Order type */}
                <View>
                  <Text variant="eyebrow" tone="muted" style={{ marginBottom: spacing.sm }}>ORDER TYPE</Text>
                  <OptionGroup
                    options={[{ value: 'MARKET', label: 'Market' }, { value: 'LIMIT', label: 'Limit' }]}
                    value={orderType}
                    onChange={setOrderType}
                    columns={2}
                  />
                </View>

                {/* Quantity */}
                <View>
                  <Row justify="space-between" style={{ marginBottom: spacing.sm }}>
                    <Text variant="eyebrow" tone="muted">QUANTITY</Text>
                    {side === 'SELL' && maxSellQty > 0 && (
                      <Pressable onPress={() => setQuantity(String(maxSellQty))} hitSlop={8}>
                        <Text variant="smallStrong" tone="brand">Sell all ({maxSellQty})</Text>
                      </Pressable>
                    )}
                  </Row>
                  <View style={styles.qtyBox}>
                    <TextInput
                      value={quantity}
                      onChangeText={(v) => {
                        const digits = v.replace(/\D/g, '')
                        const parsed = parseInt(digits) || 0
                        if (side === 'SELL' && parsed > maxSellQty) setQuantity(String(maxSellQty))
                        else setQuantity(digits)
                      }}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={colors.textSubtle}
                      style={styles.qtyInput}
                    />
                    <Row gap="sm">
                      <Pressable style={styles.stepBtn} onPress={() => setQuantity(String((parseInt(quantity) || 0) + 1))}>
                        <Text variant="smallStrong">+1</Text>
                      </Pressable>
                      <Pressable style={styles.stepBtn} onPress={() => setQuantity(String((parseInt(quantity) || 0) + 10))}>
                        <Text variant="smallStrong">+10</Text>
                      </Pressable>
                    </Row>
                  </View>
                  {sellQtyInvalid && <Text variant="small" tone="negative" style={{ marginTop: spacing.xs }}>You only own {maxSellQty} units.</Text>}
                  {sellNoHolding  && <Text variant="small" tone="negative" style={{ marginTop: spacing.xs }}>You don't own any {symbol} to sell.</Text>}
                  {qtyError && !sellQtyInvalid && !sellNoHolding && <Text variant="small" tone="negative" style={{ marginTop: spacing.xs }}>{qtyError}</Text>}
                </View>

                {orderType === 'LIMIT' && (
                  <View>
                    <Text variant="eyebrow" tone="muted" style={{ marginBottom: spacing.sm }}>LIMIT PRICE (₦)</Text>
                    <View style={styles.qtyBox}>
                      <TextInput
                        value={limitPrice}
                        onChangeText={(v) => setLimitPrice(v.replace(/[^0-9.]/g, ''))}
                        keyboardType="decimal-pad"
                        placeholder={stock.price.toFixed(2)}
                        placeholderTextColor={colors.textSubtle}
                        style={styles.qtyInput}
                      />
                    </View>
                    {limitPriceError && <Text variant="small" tone="negative" style={{ marginTop: spacing.xs }}>{limitPriceError}</Text>}
                  </View>
                )}

                {qty > 0 && (
                  <Card style={{ backgroundColor: colors.bgMuted, borderColor: 'transparent' }}>
                    <Row justify="space-between" align="center">
                      <View>
                        <Text variant="eyebrow" tone="subtle">{side === 'BUY' ? 'ESTIMATED COST' : 'ESTIMATED PROCEEDS'}</Text>
                        <Text variant="small" tone="muted" style={{ marginTop: 2 }}>{qty.toLocaleString()} × {naira(effectivePrice)}</Text>
                      </View>
                      <Text variant="h2">{naira(estimatedTotal)}</Text>
                    </Row>
                    <Text variant="small" tone="subtle" style={{ marginTop: spacing.xs }}>
                      Fees calculated on confirm
                    </Text>
                  </Card>
                )}

                {kycStatus !== 'verified' && (
                  <GateNotice
                    icon="solar:shield-user-bold"
                    title="KYC required"
                    subtitle="Complete identity verification to trade."
                    ctaLabel="Verify Now"
                    onPress={() => { setOrderSheetOpen(false); router.push('/(auth)/kyc') }}
                  />
                )}
                {kycStatus === 'verified' && cacsStatus !== 'approved' && (
                  <GateNotice
                    icon={cacsStatus === 'rejected' ? 'solar:shield-warning-bold' : 'solar:clock-circle-bold'}
                    title={cacsStatus === 'rejected' ? 'CSCS verification rejected' : 'CSCS account under review'}
                    subtitle={cacsStatus === 'rejected'
                      ? 'PAC Securities couldn’t approve your account. Redo KYC to try again.'
                      : 'Your details are with PAC Securities. Trading unlocks once approved — usually 1–2 business days.'}
                    ctaLabel={cacsStatus === 'rejected' ? 'Redo KYC' : 'View status'}
                    onPress={() => router.push((cacsStatus === 'rejected' ? '/(auth)/kyc' : '/(app)') as never)}
                  />
                )}

                {side === 'BUY' && qty > 0 && insufficientCash && (
                  <GateNotice
                    icon="solar:wallet-linear"
                    title={walletBalance <= 0 ? 'Your wallet is empty' : 'Not enough in your wallet'}
                    subtitle={walletBalance <= 0
                      ? 'Fund your wallet to start trading.'
                      : `You have ${naira(walletBalance)} — this order needs ${naira(estimatedTotal)}.`}
                    ctaLabel="Fund wallet"
                    onPress={() => { setOrderSheetOpen(false); router.push('/wallet' as never) }}
                  />
                )}

                <Button
                  title={`Review ${side === 'BUY' ? 'Buy' : 'Sell'}`}
                  variant={side === 'BUY' ? 'primary' : 'danger'}
                  onPress={() => {
                    // Fresh idempotency key per confirm-sheet-open. Any retry
                    // inside this sheet reuses the same key so PAC dedups.
                    idempotencyRef.current = makeIdempotencyKey()
                    transitionModal(() => setOrderSheetOpen(false), () => setConfirmOpen(true))
                  }}
                  disabled={!canConfirm}
                />
              </Stack>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <ConfirmSheet
        visible={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        side={side}
        symbol={stock.symbol}
        name={stock.name}
        qty={qty}
        price={effectivePrice}
        orderType={orderType}
        walletCash={walletCash}
        orderTotal={orderTotal}
        validation={validation}
        validating={validating}
        validationError={validationError}
        submitting={orderLoading}
        onConfirm={() => {
          // Compliance gate: user must accept SEC-mandated legal terms per
          // trade, then verify their transaction PIN, before we hit PAC.
          // Close the confirm sheet first, then open legal (iOS one-modal rule).
          transitionModal(() => setConfirmOpen(false), () => setLegalOpen(true))
        }}
      />

      <LegalTermsModal
        visible={legalOpen}
        side={side}
        symbol={stock.symbol}
        qty={qty}
        orderTotal={orderTotal}
        onDecline={() => {
          // Cancel the intent entirely: drop any stale refs so a subsequent
          // Place tap starts a fresh order with a fresh idempotency key.
          pendingRef.current = null
          idempotencyRef.current = null
          setLegalOpen(false)
          setConfirmOpen(false)
          toast.warn('Trade canceled', 'You must accept the trading terms to place an order.')
        }}
        onAccept={() => {
          // iOS: open the PIN modal only after the legal modal has dismissed,
          // otherwise it silently fails to present and the buy stalls.
          transitionModal(() => setLegalOpen(false), () => setPinOpen(true))
        }}
      />

      <TransactionPinModal
        visible={pinOpen}
        submitting={orderLoading}
        subtitle="Enter your 6-digit PIN to authorize this trade"
        cancelLabel="Cancel trade"
        onCancel={() => {
          // Same as decline: kill the intent so re-tapping Place produces
          // a fresh idempotency key against the fresh (possibly-edited) qty.
          pendingRef.current = null
          idempotencyRef.current = null
          setPinOpen(false)
          setConfirmOpen(false)
          toast.warn('Trade canceled', 'PIN not entered — no order was placed.')
        }}
        onVerified={async () => {
          if (!pacAccountId) return
          const qtyFinal = validateQuantity(quantity, side === 'SELL' && maxSellQty > 0 ? maxSellQty : 10_000_000)
          if (!qtyFinal.ok) { toast.error('Invalid order',qtyFinal.error); return }
          const symFinal = validateSymbol(stock.symbol)
          if (!symFinal.ok) { toast.error('Invalid order',symFinal.error); return }
          let limitFinal: number | undefined
          if (orderType === 'LIMIT') {
            const lp = validatePrice(limitPrice, { min: 0.01, max: 1_000_000 })
            if (!lp.ok) { toast.error('Invalid order',lp.error); return }
            limitFinal = lp.value
          }
          // Post-PIN cross-check: server-authoritative validation must have
          // succeeded AND wallet must still cover it. Blocks stale-state and
          // any bypass where a modified client short-circuits pre-checks.
          if (!validation) {
            toast.warn('Trade canceled','Order validation is incomplete. Try again.')
            setPinOpen(false); setConfirmOpen(false)
            pendingRef.current = null; idempotencyRef.current = null
            return
          }
          const authoritativeTotal = validation.totalValue
          if (side === 'BUY') {
            // Single source of truth: the live PAC balance mirrored into the
            // wallet. (PAC also rejects an underfunded order at placement.)
            const freshCash = walletCash
            if (freshCash < authoritativeTotal) {
              toast.warn('Trade canceled','Insufficient wallet balance for the fee-inclusive total.')
              setPinOpen(false); setConfirmOpen(false)
              pendingRef.current = null; idempotencyRef.current = null
              return
            }
          }
          pendingRef.current = { side, qty: qtyFinal.value, total: authoritativeTotal }
          if (!idempotencyRef.current) idempotencyRef.current = makeIdempotencyKey()
          setPinOpen(false)
          await placeOrder({
            accountId: pacAccountId,
            symbol: symFinal.value,
            side,
            quantity: qtyFinal.value,
            orderType,
            limitPrice: limitFinal,
            estimatedTotal: authoritativeTotal,
          }, idempotencyRef.current)
        }}
      />

      <ReceiptSheet
        receipt={receipt}
        symbol={stock.symbol}
        name={stock.name}
        onClose={() => { setReceipt(null); setQuantity('') }}
        onViewPortfolio={() => {
          setReceipt(null)
          // "View Portfolio" always lands on Home regardless of where the
          // trade was opened from — the user just placed a trade and wants
          // to see the position, not resume browsing Market.
          router.replace('/(app)')
        }}
      />
    </SafeAreaView>
  )
}

// Order idempotency key.
//
// CRITICAL: the old implementation used `crypto?.getRandomValues(buf)` with
// an optional-chain. In Hermes (React Native release) `globalThis.crypto`
// exists but LACKS getRandomValues, so `?.` silently returned undefined
// instead of running the call. `buf` stayed all zeros, we then set the
// version/variant bits on a zero buffer, and EVERY order flowed with the
// same idempotency key: 00000000-0000-4000-8000-000000000000.
//
// PAC treated that key as a duplicate and replayed the FIRST order's
// response for every subsequent placeOrder call — so trades looked
// "successful" in the app (toast + receipt) while never actually being
// placed. Wallet wasn't debited, orders didn't appear, positions didn't
// grow.
//
// Now: prefer real CSPRNG if getRandomValues is truly there, else fall
// back to Math.random (fine for idempotency — collision risk is negligible
// vs. the alternative which was 100% collision).
function makeIdempotencyKey(): string {
  const hex = '0123456789abcdef'
  const buf = new Uint8Array(16)
  const rng = (globalThis.crypto ?? (globalThis as { msCrypto?: Crypto }).msCrypto) as
    { getRandomValues?: (b: Uint8Array) => void } | undefined
  let filled = false
  if (rng && typeof rng.getRandomValues === 'function') {
    try { rng.getRandomValues(buf); filled = true } catch { /* fall through */ }
  }
  if (!filled) {
    for (let i = 0; i < 16; i++) buf[i] = Math.floor(Math.random() * 256)
  }
  buf[6] = (buf[6] & 0x0f) | 0x40 // v4
  buf[8] = (buf[8] & 0x3f) | 0x80 // variant
  const out: string[] = []
  for (let i = 0; i < 16; i++) {
    if (i === 4 || i === 6 || i === 8 || i === 10) out.push('-')
    out.push(hex[buf[i] >> 4], hex[buf[i] & 0x0f])
  }
  return out.join('')
}

function GateNotice({ icon, title, subtitle, ctaLabel, onPress }: { icon: string; title: string; subtitle: string; ctaLabel: string; onPress: () => void }) {
  return (
    <Card style={{ backgroundColor: colors.warningSubtle, borderColor: 'transparent' }}>
      <Row justify="space-between" align="center" gap="md">
        <Row gap="md" align="flex-start" style={{ flex: 1 }}>
          <Icon name={icon} size={22} color={colors.warning} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong" style={{ color: colors.warning }}>{title}</Text>
            <Text variant="small" tone="muted" style={{ marginTop: spacing.xs }}>{subtitle}</Text>
          </View>
        </Row>
        <Button title={ctaLabel} size="sm" fullWidth={false} onPress={onPress} />
      </Row>
    </Card>
  )
}

function ConfirmSheet({
  visible, onClose, side, symbol, name, qty, price, orderType,
  walletCash, orderTotal, validation, validating, validationError, submitting, onConfirm,
}: {
  visible: boolean
  onClose: () => void
  side: Side
  symbol: string
  name: string
  qty: number
  price: number
  orderType: OrderType
  walletCash: number
  orderTotal: number
  validation: PacValidationResult | null
  validating: boolean
  validationError: string | null
  submitting: boolean
  onConfirm: () => void
}) {
  const styles = useThemedStyles(makeStyles)
  const insufficient = side === 'BUY' && walletCash < orderTotal
  const buy = side === 'BUY'
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.sheetOverlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          <Row gap="md" align="center" style={{ marginBottom: spacing.lg }}>
            <StockLogo symbol={symbol} size={44} />
            <View style={{ flex: 1 }}>
              <Row gap="sm" align="center">
                <Text variant="h3">{symbol}</Text>
                <View style={sidePillStyle(buy)}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: buy ? colors.positive : colors.negative, letterSpacing: 0.4 }}>
                    {side}
                  </Text>
                </View>
              </Row>
              <Text variant="small" tone="muted" numberOfLines={1}>{name}</Text>
            </View>
          </Row>

          <ScrollView
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ paddingBottom: spacing.md }}
            showsVerticalScrollIndicator={false}
          >
            <Card style={{ marginBottom: spacing.md }}>
              <ReviewRow label="Order Type" value={orderType} />
              <Divider my="sm" />
              <ReviewRow label="Quantity"   value={`${qty.toLocaleString()} units`} />
              <Divider my="sm" />
              <ReviewRow label="Price"      value={naira(price)} />
              <Divider my="sm" />
              <ReviewRow label="Estimated"  value={naira(orderTotal)} strong />
            </Card>

            {validating && (
              <Card style={{ marginBottom: spacing.md, backgroundColor: colors.bgMuted, borderColor: 'transparent' }}>
                <Row gap="sm" align="center">
                  <Loader size={18} />
                  <Text variant="small" tone="muted">Calculating fees…</Text>
                </Row>
              </Card>
            )}
            {validationError && (
              <Card style={{ marginBottom: spacing.md, backgroundColor: colors.negativeSubtle, borderColor: 'transparent' }}>
                <Text variant="small" tone="negative">Fee calc failed: {validationError}</Text>
              </Card>
            )}
            {validation && (
              <Card style={{ marginBottom: spacing.md, backgroundColor: colors.bgMuted, borderColor: 'transparent' }}>
                <Text variant="eyebrow" tone="muted" style={{ marginBottom: spacing.sm }}>FEES & CHARGES</Text>
                <ReviewRow label="Consideration"      value={naira(validation.consideration)} />
                <ReviewRow label="Commission + Fees"  value={naira(validation.commission + validation.fees)} />
                <Divider my="sm" />
                <ReviewRow label="Total Due"          value={naira(validation.totalValue)} strong />
              </Card>
            )}

            {insufficient && (
              <Card style={{ marginBottom: spacing.md, backgroundColor: colors.negativeSubtle, borderColor: 'transparent' }}>
                <Row gap="md" align="flex-start">
                  <Icon name="solar:wallet-money-bold" size={20} color={colors.negative} />
                  <View style={{ flex: 1 }}>
                    <Text variant="smallStrong" tone="negative">Insufficient funds</Text>
                    <Text variant="small" tone="muted" style={{ marginTop: spacing.xs }}>Wallet balance: {naira(walletCash)}</Text>
                  </View>
                </Row>
              </Card>
            )}

            {side === 'SELL' && (
              <Card style={{ marginBottom: spacing.md, backgroundColor: colors.warningSubtle, borderColor: 'transparent' }}>
                <Row gap="md" align="flex-start">
                  <Icon name="solar:calendar-mark-bold" size={20} color={colors.warning} />
                  <View style={{ flex: 1 }}>
                    <Text variant="smallStrong" style={{ color: colors.warning }}>T+3 Settlement</Text>
                    <Text variant="small" tone="muted" style={{ marginTop: spacing.xs }}>
                      Proceeds will credit your cash balance 3 business days after today's trade date (NGX rule).
                    </Text>
                  </View>
                </Row>
              </Card>
            )}
          </ScrollView>

          <Row gap="md" style={{ marginTop: spacing.md }}>
            <Button title="Cancel" variant="secondary" onPress={onClose} />
            <Button
              title={submitting ? 'Placing…' : `Confirm ${side}`}
              variant={side === 'BUY' ? 'primary' : 'danger'}
              onPress={onConfirm}
              loading={submitting}
              // Require server-side validation to have completed successfully
              // — blocks any race where a modified client fires placeOrder
              // before fees/oversell/insufficient-cash checks come back.
              disabled={validating || insufficient || !!validationError || !validation}
            />
          </Row>
        </View>
      </View>
    </Modal>
  )
}

function ReviewRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Row justify="space-between" style={{ paddingVertical: 2 }}>
      <Text variant="small" tone="muted">{label}</Text>
      <Text variant={strong ? 'bodyStrong' : 'smallStrong'}>{value}</Text>
    </Row>
  )
}

function ReceiptSheet({ receipt, symbol, name, onClose, onViewPortfolio }: {
  receipt: { side: Side; qty: number; total: number; orderNo?: string | null } | null
  symbol: string
  name: string
  onClose: () => void
  onViewPortfolio: () => void
}) {
  const styles = useThemedStyles(makeStyles)
  if (!receipt) return null
  const isBuy = receipt.side === 'BUY'
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.lg }}>
          <View style={styles.check}>
            <Icon name="solar:check-read-bold" size={44} color={colors.textOnBrand} />
          </View>
          <Text variant="eyebrow" tone="muted">{isBuy ? 'BUY ORDER PLACED' : 'SELL ORDER PLACED'}</Text>
          <Text variant="display">{naira(receipt.total)}</Text>
          <Row gap="sm" align="center">
            <StockLogo symbol={symbol} size={20} />
            <Text variant="body" tone="muted">{receipt.qty.toLocaleString()} shares · {symbol}</Text>
          </Row>

          <Card style={{ width: '100%', marginTop: spacing.xl }}>
            <ReviewRow label="Security"  value={name} />
            <Divider my="sm" />
            <ReviewRow label="Side"      value={receipt.side} />
            <Divider my="sm" />
            <ReviewRow label="Quantity"  value={`${receipt.qty.toLocaleString()} units`} />
            <Divider my="sm" />
            <ReviewRow label="Total"     value={naira(receipt.total)} strong />
            {receipt.orderNo && (
              <>
                <Divider my="sm" />
                <ReviewRow label="Order Ref" value={receipt.orderNo.length > 20 ? receipt.orderNo.slice(0, 20) + '…' : receipt.orderNo} />
              </>
            )}
          </Card>

          {!isBuy && (
            <Card style={{ width: '100%', backgroundColor: colors.warningSubtle, borderColor: 'transparent' }}>
              <Row gap="md" align="flex-start">
                <Icon name="solar:calendar-mark-bold" size={20} color={colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text variant="smallStrong" style={{ color: colors.warning }}>T+3 Settlement</Text>
                  <Text variant="small" tone="muted" style={{ marginTop: spacing.xs }}>
                    Your proceeds of {naira(receipt.total)} will credit your cash balance in 3 business days.
                  </Text>
                </View>
              </Row>
            </Card>
          )}
        </View>

        <Row gap="md">
          <Button title="New Trade" variant="secondary" onPress={onClose} />
          <Button title="View Portfolio" onPress={onViewPortfolio} />
        </Row>
      </SafeAreaView>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────
// LegalTermsModal — SEC-mandated per-trade disclosure. User must
// tick the acknowledgement box before the Accept button enables.
// Declining shows a "Trade canceled" alert upstream.
// ─────────────────────────────────────────────────────────────
function LegalTermsModal({
  visible, side, symbol, qty, orderTotal, onAccept, onDecline,
}: {
  visible: boolean
  side: Side
  symbol: string
  qty: number
  orderTotal: number
  onAccept: () => void
  onDecline: () => void
}) {
  const styles = useThemedStyles(makeStyles)
  const [checked, setChecked] = useState(false)

  useEffect(() => { if (visible) setChecked(false) }, [visible])

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDecline}>
      <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.sheetOverlay}>
        <Pressable style={{ flex: 1 }} onPress={onDecline} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          <Row gap="md" align="center" style={{ marginBottom: spacing.md }}>
            {/* Brand mark stands in as the "credentialing" symbol — same
                colourway swap logic as everywhere else, so it inverts
                automatically between light and dark modes. */}
            <View style={legalBadgeStyle}>
              <EticoMark size={26} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="h3">Trading Terms</Text>
              <Text variant="small" tone="muted">SEC-regulated broker · Review before you trade</Text>
            </View>
          </Row>

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: spacing.md }}>
            <Card style={{ marginBottom: spacing.md, backgroundColor: colors.bgMuted, borderColor: 'transparent' }}>
              <Text variant="eyebrow" tone="muted" style={{ marginBottom: spacing.sm }}>ORDER SUMMARY</Text>
              <Row justify="space-between"><Text variant="small" tone="muted">Action</Text><Text variant="smallStrong">{side} {symbol}</Text></Row>
              <Row justify="space-between" style={{ marginTop: spacing.xs }}><Text variant="small" tone="muted">Quantity</Text><Text variant="smallStrong">{qty.toLocaleString()} units</Text></Row>
              <Row justify="space-between" style={{ marginTop: spacing.xs }}><Text variant="small" tone="muted">Estimated Total</Text><Text variant="smallStrong">{naira(orderTotal)}</Text></Row>
            </Card>

            <LegalClause
              title="1. Market Risk"
              body="Equity investments carry risk of loss including the entire principal. Past performance is not indicative of future results. Prices on the Nigerian Exchange (NGX) fluctuate and may fall as well as rise."
            />
            <LegalClause
              title="2. Order Irrevocability"
              body="Once submitted, this order is transmitted to ETICO's brokerage partner and to NGX for execution. It cannot be recalled once matched. Market orders execute at the best available price, which may differ from the last-traded price shown."
            />
            <LegalClause
              title="3. Settlement (T+3)"
              body="Nigerian equity trades settle three business days after the trade date. Sell proceeds are not immediately available in cash. Buy orders require cleared funds in your wallet at the time of placement."
            />
            <LegalClause
              title="4. Fees & Charges"
              body="Trades are subject to NGX, CSCS, SEC and stamp-duty charges plus ETICO's brokerage commission, as disclosed in your fee schedule and shown on the confirmation screen."
            />
            <LegalClause
              title="5. Best Execution & Advice"
              body="ETICO acts on an execution-only basis. We do not provide investment advice, tax advice or recommendations. Your decision to buy or sell is your own, made after your own assessment of suitability."
            />
            <LegalClause
              title="6. Regulatory Compliance"
              body="ETICO is offered by Moneta Capital Investment Limited, licensed and regulated by the Securities and Exchange Commission of Nigeria (SEC) and the Nigerian Exchange Limited (NGX). By placing this order you confirm you are the beneficial owner of the account and that the funds used are lawfully obtained."
            />
          </ScrollView>

          <Pressable
            onPress={() => setChecked(v => !v)}
            style={styles.legalChecker}
            hitSlop={8}
          >
            <View style={[styles.legalCheckbox, checked && styles.legalCheckboxActive]}>
              {checked && <Icon name="solar:check-read-bold" size={14} color={colors.textOnBrand} />}
            </View>
            <Text variant="small" style={{ flex: 1, color: colors.text }}>
              I have read and accept the trading terms above, and I acknowledge the risks of investing in listed securities.
            </Text>
          </Pressable>

          <Row gap="md" style={{ marginTop: spacing.md }}>
            <Button title="Decline" variant="secondary" onPress={onDecline} />
            <Button
              title="Accept & Continue"
              variant={side === 'BUY' ? 'primary' : 'danger'}
              onPress={onAccept}
              disabled={!checked}
            />
          </Row>
        </View>
      </View>
    </Modal>
  )
}

function LegalClause({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text variant="smallStrong" style={{ marginBottom: 4 }}>{title}</Text>
      <Text variant="small" tone="muted" style={{ lineHeight: 18 }}>{body}</Text>
    </View>
  )
}

const legalBadgeStyle = {
  width: 44, height: 44, borderRadius: 22,
  backgroundColor: colors.brandSubtle,
  alignItems: 'center' as const, justifyContent: 'center' as const,
}

// Style factories
const changePillStyle = (up: boolean) => ({
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  paddingHorizontal: 8,
  paddingVertical: 3,
  borderRadius: radii.pill,
  backgroundColor: up ? colors.positiveSubtle : colors.negativeSubtle,
})
const sidePillStyle = (buy: boolean) => ({
  paddingHorizontal: 8,
  paddingVertical: 3,
  borderRadius: radii.pill,
  backgroundColor: buy ? colors.positiveSubtle : colors.negativeSubtle,
})
const ownedPillStyle = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  paddingHorizontal: 10,
  paddingVertical: 6,
  borderRadius: radii.pill,
  backgroundColor: colors.brandSubtle,
}

const makeStyles = () => StyleSheet.create({
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tradeBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing['2xl'],
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  orderRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  orderBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  orderSheet: {
    maxHeight: '88%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  orderHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.lg,
  },
  qtyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    height: 64,
    backgroundColor: colors.bg,
  },
  qtyInput: {
    flex: 1,
    ...typography.h1,
    color: colors.text,
  },
  stepBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.xl,
    paddingBottom: spacing['5xl'],   // clears the API 35 edge-to-edge gesture bar
    maxHeight: '90%',
    borderTopWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 20,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  check: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.positive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legalChecker: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.bgMuted,
    marginTop: spacing.xs,
  },
  legalCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  legalCheckboxActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
})
