import { useEffect, useRef, useState } from 'react'
import {
  View, KeyboardAvoidingView, Platform, Pressable, TextInput, ScrollView,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { MotiView } from 'moti'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { initiateBvn, confirmBvnOtp, type BvnProfile } from '@/lib/nibssApi'
import { createBrokerAccount } from '@/lib/pacApi'
import {
  validateBvn, validateOtp, validateFullName, validateDob,
  validateAddress, validateNigerianPhone, validateIdNumber,
} from '@/lib/validation'
import { Text, Button, Icon } from '@/ui'
import { colors, spacing, radii } from '@/theme'

type Step = 1 | 2 | 3

const ID_TYPES = [
  { value: 'National ID (NIN)',      label: 'National ID (NIN)' },
  { value: 'International Passport', label: 'International Passport' },
  { value: "Driver's Licence",       label: "Driver's Licence" },
  { value: "Voter's Card",           label: "Voter's Card" },
] as const

const STEP_META: Record<Step, { title: string; subtitle: string }> = {
  1: { title: 'Let’s verify it’s you', subtitle: 'Confirm your BVN, then a few personal details.' },
  2: { title: 'ID & settlement account', subtitle: 'Your ID, and the bank account for sale proceeds & withdrawals.' },
  3: { title: 'Confirm your details',   subtitle: 'Check everything is correct before we create your account.' },
}

export default function KycScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user, loadProfile, ensureWallet } = useAuthStore()
  const [step, setStep] = useState<Step>(1)

  // Step 1
  const [bvn, setBvn] = useState('')
  const [bvnRef, setBvnRef] = useState<string | null>(null)
  const [otp, setOtp] = useState('')
  const [bvnDone, setBvnDone] = useState(false)
  const [bvnSkipped, setBvnSkipped] = useState(false)
  const [bvnLoading, setBvnLoading] = useState(false)
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpWaitSec, setOtpWaitSec] = useState(0)
  const [bvnError, setBvnError] = useState<string | null>(null)
  const bvnInFlight = useRef(false)

  // Personal
  const [fullName, setFullName] = useState('')
  const [dob, setDob] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  // Full BVN record (kept so we can persist every field + create the VA with
  // the exact surname / first name / NIN NIBSS returned).
  const [bvnProfile, setBvnProfile] = useState<BvnProfile | null>(null)

  // Step 2 — ID
  const [idType, setIdType] = useState<typeof ID_TYPES[number]['value']>('International Passport')
  const [idNumber, setIdNumber] = useState('')
  // Step 2 — settlement (bank) account. This is the PAC account-opening form's
  // "BANK ACCOUNT DETAILS": where sale proceeds / withdrawals are paid out. It
  // is NOT the Moneta funding wallet. Reviewed by PAC on the partner dashboard.
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName] = useState('')

  // Step 3
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!bvnRef) { setOtpWaitSec(0); return }
    const readyAt = Date.now() + 5000
    const tick = () => setOtpWaitSec(Math.max(0, Math.ceil((readyAt - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [bvnRef])

  async function sendOtp() {
    if (bvnInFlight.current || bvnRef) return
    const v = validateBvn(bvn)
    if (!v.ok) { setBvnError(v.error); return }
    bvnInFlight.current = true
    setBvnLoading(true); setBvnError(null)
    try {
      const res = await initiateBvn(v.value)
      setBvnRef(res.reference)
    } catch (e) {
      setBvnError((e as Error).message)
    } finally {
      bvnInFlight.current = false
      setBvnLoading(false)
    }
  }

  async function verifyOtp(codeOverride?: string) {
    if (!bvnRef || otpWaitSec > 0) return
    const v = validateOtp(codeOverride ?? otp, 6)
    if (!v.ok) { setBvnError(v.error); return }
    setOtpLoading(true); setBvnError(null)
    try {
      const profile = await confirmBvnOtp(bvnRef, v.value)
      setBvnProfile(profile)
      if (profile.firstName || profile.surname) {
        setFullName([profile.firstName, profile.middleName, profile.surname].filter(Boolean).join(' '))
      }
      if (profile.dob)     setDob(profile.dob)
      if (profile.address) setAddress(profile.address)
      if (profile.phone)   setPhone(profile.phone)
      if (profile.nin) { setIdType('National ID (NIN)'); setIdNumber(profile.nin) }
      setBvnDone(true)
    } catch (e) {
      setBvnError((e as Error).message)
      setOtp('')
    } finally {
      setOtpLoading(false)
    }
  }

  function resetBvn() {
    setBvnDone(false); setBvnRef(null); setOtp(''); setBvnError(null)
  }

  const canStep1 =
    (bvnDone || bvnSkipped)
    && validateFullName(fullName).ok
    && validateDob(dob).ok
    && validateAddress(address).ok
    && validateNigerianPhone(phone).ok
  const settlementOk =
    bankName.trim().length >= 2
    && /^\d{10}$/.test(accountNumber)
    && accountName.trim().length >= 2
  const canStep2 = !!idType && validateIdNumber(idNumber).ok && settlementOk

  async function submit() {
    if (!user) return
    const name    = validateFullName(fullName)
    const dobV    = validateDob(dob)
    const addrV   = validateAddress(address)
    const phoneV  = validateNigerianPhone(phone)
    const idNumV  = validateIdNumber(idNumber)
    const bvnV    = bvnSkipped ? { ok: true, value: '' } as const : validateBvn(bvn)

    const firstFail = [name, dobV, addrV, phoneV, idNumV, bvnV].find(r => !r.ok)
    if (firstFail && !firstFail.ok) { setSubmitError(firstFail.error); return }
    if (!name.ok || !dobV.ok || !addrV.ok || !phoneV.ok || !idNumV.ok || !bvnV.ok) return

    // Settlement (bank) account — PAC form's "BANK ACCOUNT DETAILS".
    const acctName = accountName.trim()
    const acctNo   = accountNumber.replace(/\D/g, '')
    const bank     = bankName.trim()
    if (acctName.length < 2 || acctName.length > 120) { setSubmitError('Enter the account name on your settlement account'); return }
    if (!/^\d{10}$/.test(acctNo))                     { setSubmitError('Settlement account number must be 10 digits'); return }
    if (bank.length < 2 || bank.length > 80)          { setSubmitError('Enter your settlement bank'); return }

    setSaving(true); setSubmitError(null)
    try {
      // BVN-derived identity is written ONLY when this run actually captured it
      // (OTP-verified). Otherwise we omit those columns so a redo that skips BVN
      // (e.g. fixing only the settlement account) doesn't null out previously
      // verified data — which the wallet VA depends on.
      const bvnFields = bvnProfile ? {
        first_name:      bvnProfile.firstName || null,
        middle_name:     bvnProfile.middleName || null,
        surname:         bvnProfile.surname || null,
        gender:          bvnProfile.gender || null,
        marital_status:  bvnProfile.maritalStatus || null,
        nationality:     bvnProfile.nationality || null,
        state_of_origin: bvnProfile.stateOfOrigin || null,
        lga_of_origin:   bvnProfile.lgaOfOrigin || null,
        title:           bvnProfile.title || null,
      } : {}
      // NIN can come from the BVN record OR the ID fields; only write it when we
      // have a value, so a redo without it doesn't wipe an existing NIN.
      const ninValue = bvnProfile?.nin || (idType === 'National ID (NIN)' ? idNumV.value : '')

      const { error: dbError } = await supabase.from('profiles').upsert({
        id: user.id,
        full_name: name.value,
        date_of_birth: dobV.value,
        address: addrV.value,
        phone: phoneV.value,
        id_type: idType,
        id_number: idNumV.value,
        kyc_status: 'submitted',
        // Settlement (bank) account — reviewed on the PAC partner dashboard.
        settlement_account_name:   acctName,
        settlement_account_number: acctNo,
        settlement_bank_name:      bank,
        // Only overwrite BVN / NIN when actually provided this run.
        ...(bvnV.value ? { bvn: bvnV.value } : {}),
        ...(ninValue ? { nin: ninValue } : {}),
        ...bvnFields,
      })
      if (dbError) throw new Error(dbError.message)

      const pacAccountId = await createBrokerAccount({
        fullName: name.value,
        email:    user.email ?? '',
        phone:    phoneV.value,
        bvn:      bvnV.value,
        dob:      dobV.value,
        address:  addrV.value,
        idType,
        idNumber: idNumV.value,
      })

      // Identity is verified and the broker account exists, but the CSCS
      // account still needs a PAC reviewer to approve it on the partner
      // dashboard. Mark it 'pending' so the app shows "CSCS under review" until
      // the reviewer flips it to 'approved' (which unlocks trading) or
      // 'rejected'. A redo re-runs this whole flow → back to 'pending'.
      const { error: updateErr } = await supabase.from('profiles')
        .update({ pac_account_id: pacAccountId, kyc_status: 'verified', cacs_status: 'pending', cacs_rejection_reason: null })
        .eq('id', user.id)
      if (updateErr) throw new Error(updateErr.message)

      await loadProfile()

      // Open the Moneta wallet (virtual account) now that we have the verified
      // identity. Best-effort — a failure here (e.g. proxy not yet reachable)
      // must not block KYC completion; the Wallet screen retries on open.
      try { await ensureWallet() }
      catch (e) { console.warn('[kyc] wallet provisioning deferred:', (e as Error).message) }

      router.replace('/(app)')
    } catch (e) {
      setSubmitError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const goBackStep = () => setStep(s => (s > 1 ? ((s - 1) as Step) : s))

  const cta =
    step === 1 ? { label: 'Continue', disabled: !canStep1, loading: false, onPress: () => setStep(2) }
    : step === 2 ? { label: 'Continue', disabled: !canStep2, loading: false, onPress: () => setStep(3) }
    : { label: saving ? 'Submitting…' : 'Submit KYC', disabled: saving, loading: saving, onPress: submit }

  const meta = STEP_META[step]

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* ── Top bar: back + step counter + progress ── */}
        <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 40 }}>
            {step > 1 ? (
              <Pressable onPress={goBackStep} hitSlop={12} style={styles.backBtn()}>
                <Icon name="solar:arrow-left-linear" size={20} color={colors.text} />
              </Pressable>
            ) : <View style={{ width: 40 }} />}
            <Text variant="eyebrow" tone="muted">STEP {step} / 3</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={{ flexDirection: 'row', gap: 6, marginTop: spacing.md }}>
            {[1, 2, 3].map(n => (
              <MotiView
                key={n}
                animate={{ backgroundColor: n <= step ? (n === step ? colors.accent : colors.brand) : colors.border }}
                transition={{ type: 'timing', duration: 260 }}
                style={{ flex: 1, height: 5, borderRadius: radii.pill }}
              />
            ))}
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing['2xl'], paddingBottom: spacing['3xl'] }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <MotiView
            key={step}
            from={{ opacity: 0, translateX: 16 }}
            animate={{ opacity: 1, translateX: 0 }}
            transition={{ type: 'timing', duration: 280 }}
          >
            <Text variant="display" style={{ fontSize: 30, lineHeight: 36, letterSpacing: -1 }}>{meta.title}</Text>
            <Text variant="body" tone="muted" style={{ marginTop: spacing.sm }}>{meta.subtitle}</Text>

            <View style={{ height: spacing['2xl'] }} />

            {/* ───────────────────────── STEP 1 ───────────────────────── */}
            {step === 1 && (
              <View>
                <UField
                  label="Bank Verification Number"
                  value={bvn}
                  onChangeText={(v: string) => {
                    const digits = v.replace(/\D/g, '').slice(0, 11)
                    setBvn(digits)
                    if (bvnDone || bvnRef) resetBvn()
                    if (bvnSkipped) setBvnSkipped(false)
                  }}
                  placeholder="11 digits"
                  keyboardType="number-pad"
                  editable={!bvnDone && !bvnSkipped}
                  maxLength={11}
                  big
                  error={bvnError && !bvnRef ? bvnError : null}
                  trailing={
                    bvnDone ? (
                      <Icon name="solar:check-circle-bold" size={22} color={colors.positive} />
                    ) : bvnSkipped ? (
                      <Pressable onPress={() => setBvnSkipped(false)} hitSlop={8}>
                        <Text variant="smallStrong" tone="muted">CHANGE</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={sendOtp}
                        disabled={bvn.length !== 11 || bvnLoading || !!bvnRef}
                        hitSlop={8}
                      >
                        <Text variant="smallStrong" style={{ color: bvn.length === 11 && !bvnLoading ? colors.accent : colors.textSubtle }}>
                          {bvnLoading ? 'Sending…' : 'Send OTP'}
                        </Text>
                      </Pressable>
                    )
                  }
                />

                {/* OTP entry */}
                {bvnRef && !bvnDone && (
                  <MotiView from={{ opacity: 0, translateY: 8 }} animate={{ opacity: 1, translateY: 0 }} style={{ marginBottom: spacing['2xl'] }}>
                    <Row2 label={otpWaitSec > 0 ? `Code sent — ready in ${otpWaitSec}s` : 'Enter the 6-digit code sent to your BVN phone'} />
                    <OtpBoxes
                      value={otp}
                      disabled={otpLoading}
                      error={!!bvnError}
                      onChange={setOtp}
                      onComplete={(code) => verifyOtp(code)}
                    />
                    {bvnError ? <Text variant="small" tone="negative" style={{ marginTop: spacing.md }}>{bvnError}</Text> : null}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg }}>
                      <Pressable onPress={() => verifyOtp()} disabled={otp.length !== 6 || otpWaitSec > 0 || otpLoading} hitSlop={8}>
                        <Text variant="smallStrong" style={{ color: otp.length === 6 && otpWaitSec === 0 ? colors.accent : colors.textSubtle }}>
                          {otpLoading ? 'Verifying…' : 'Verify code'}
                        </Text>
                      </Pressable>
                      <Pressable onPress={() => { setBvnRef(null); setOtp(''); setBvnSkipped(true) }} hitSlop={8}>
                        <Text variant="smallStrong" tone="muted">Skip verification</Text>
                      </Pressable>
                    </View>
                  </MotiView>
                )}

                {/* Offer skip before OTP is sent too */}
                {bvn.length === 11 && !bvnDone && !bvnSkipped && !bvnRef && (
                  <Pressable onPress={() => setBvnSkipped(true)} hitSlop={8} style={{ marginTop: -spacing.md, marginBottom: spacing['2xl'] }}>
                    <Text variant="smallStrong" tone="muted">Continue without OTP verification</Text>
                  </Pressable>
                )}

                {/* Personal details reveal once BVN is settled */}
                {(bvnDone || bvnSkipped) && (
                  <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 320 }}>
                    <Divider label="Your details" />
                    <UField label="Full name" value={fullName} onChangeText={setFullName} placeholder="Your full name" autoCapitalize="words" />
                    <UField label="Date of birth" value={dob} onChangeText={setDob} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
                    <UField label="Residential address" value={address} onChangeText={setAddress} placeholder="Where you live" autoCapitalize="words" />
                    <UField label="Phone number" value={phone} onChangeText={setPhone} placeholder="e.g. 08012345678" keyboardType="phone-pad" autoComplete="tel" />
                  </MotiView>
                )}
              </View>
            )}

            {/* ───────────────────────── STEP 2 ───────────────────────── */}
            {step === 2 && (
              <View>
                <Text variant="eyebrow" tone="muted" style={{ marginBottom: spacing.md }}>ID TYPE</Text>
                <View style={styles.listCard()}>
                  {ID_TYPES.map((t, i) => {
                    const selected = t.value === idType
                    return (
                      <Pressable
                        key={t.value}
                        onPress={() => setIdType(t.value)}
                        style={[styles.listRow(), i < ID_TYPES.length - 1 && styles.listRowDivider()]}
                      >
                        <Text variant="bodyStrong" style={{ color: selected ? colors.text : colors.textMuted }}>{t.label}</Text>
                        <View style={styles.radioOuter(selected)}>
                          {selected && <View style={styles.radioDot()} />}
                        </View>
                      </Pressable>
                    )
                  })}
                </View>

                <View style={{ height: spacing['2xl'] }} />
                <UField label="ID number" value={idNumber} onChangeText={setIdNumber} placeholder="Enter your ID number" autoCapitalize="characters" big />

                <Divider label="Settlement bank account" />
                <View style={styles.uploadNote()}>
                  <Icon name="solar:info-circle-linear" size={18} color={colors.textMuted} />
                  <Text variant="small" tone="muted" style={{ flex: 1 }}>
                    Where your sale proceeds and withdrawals are paid out. Use an account in your own name.
                  </Text>
                </View>
                <View style={{ height: spacing.xl }} />
                <UField
                  label="Bank name"
                  value={bankName}
                  onChangeText={setBankName}
                  placeholder="e.g. Guaranty Trust Bank"
                  autoCapitalize="words"
                />
                <UField
                  label="Account number"
                  value={accountNumber}
                  onChangeText={(v: string) => setAccountNumber(v.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10 digits"
                  keyboardType="number-pad"
                  maxLength={10}
                />
                <UField
                  label="Account name"
                  value={accountName}
                  onChangeText={setAccountName}
                  placeholder="Name on the account"
                  autoCapitalize="words"
                />
              </View>
            )}

            {/* ───────────────────────── STEP 3 ───────────────────────── */}
            {step === 3 && (
              <View>
                {/* Verified banner */}
                <View style={styles.banner(bvnDone)}>
                  <Icon name={bvnDone ? 'solar:verified-check-bold' : 'solar:info-circle-bold'} size={20} color={bvnDone ? colors.positive : colors.accent} />
                  <Text variant="small" style={{ flex: 1, color: colors.text }}>
                    {bvnDone
                      ? 'Verified with your BVN. Details below are pulled from your bank record.'
                      : 'Submitted without OTP. We’ll verify your BVN before enabling trading.'}
                  </Text>
                </View>

                <Text variant="h2" align="center" style={{ marginTop: spacing['2xl'], marginBottom: spacing.xl }}>
                  {fullName || 'Your name'}
                </Text>

                <View style={styles.listCard()}>
                  <ReviewRow label="Date of birth" value={dob} />
                  <ReviewRow label="Phone" value={phone} />
                  <ReviewRow label="Address" value={address} />
                  {bvnProfile?.gender ?        <ReviewRow label="Gender" value={bvnProfile.gender} /> : null}
                  {bvnProfile?.maritalStatus ? <ReviewRow label="Marital status" value={bvnProfile.maritalStatus} /> : null}
                  {bvnProfile?.nationality ?   <ReviewRow label="Nationality" value={bvnProfile.nationality} /> : null}
                  {bvnProfile?.stateOfOrigin ? <ReviewRow label="State of origin" value={bvnProfile.stateOfOrigin} /> : null}
                  {bvnProfile?.lgaOfOrigin ?   <ReviewRow label="LGA of origin" value={bvnProfile.lgaOfOrigin} /> : null}
                  <ReviewRow label="BVN" value={bvn ? `••••••${bvn.slice(-3)}` : 'Not provided'} />
                  <ReviewRow label="ID type" value={idType} />
                  <ReviewRow label="ID number" value={idNumber} />
                  <ReviewRow label="Settlement bank" value={bankName} />
                  <ReviewRow label="Account number" value={accountNumber} />
                  <ReviewRow label="Account name" value={accountName} last />
                </View>

                <View style={styles.uploadNote()}>
                  <Icon name="solar:cloud-upload-linear" size={18} color={colors.textMuted} />
                  <Text variant="small" tone="muted" style={{ flex: 1 }}>
                    Document photo upload is coming soon. For now we submit these details and create your brokerage account.
                  </Text>
                </View>

                {submitError && <Text variant="small" tone="negative" style={{ marginTop: spacing.lg }}>{submitError}</Text>}
              </View>
            )}
          </MotiView>
        </ScrollView>

        {/* ── Sticky bottom CTA ── */}
        <View style={[styles.bottomBar(), { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <Button title={cta.label} onPress={cta.onPress} disabled={cta.disabled} loading={cta.loading} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ── Underline field ────────────────────────────────────────────────
function UField({
  label, error, trailing, big, ...props
}: any) {
  const [focused, setFocused] = useState(false)
  const borderColor = error ? colors.negative : focused ? colors.accent : colors.borderStrong
  return (
    <View style={{ marginBottom: spacing['2xl'] }}>
      <Text variant="eyebrow" tone="muted" style={{ marginBottom: spacing.md }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: borderColor, paddingBottom: spacing.sm }}>
        <TextInput
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.accent}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ flex: 1, fontSize: big ? 22 : 18, fontWeight: '600', color: colors.text, padding: 0, letterSpacing: big ? 1 : 0 }}
          {...props}
        />
        {trailing ? <View style={{ marginLeft: spacing.md }}>{trailing}</View> : null}
      </View>
      {error ? <Text variant="small" tone="negative" style={{ marginTop: spacing.sm }}>{error}</Text> : null}
    </View>
  )
}

// ── 6-box OTP ──────────────────────────────────────────────────────
function OtpBoxes({ value, onChange, onComplete, disabled, error }: {
  value: string; onChange: (v: string) => void; onComplete: (code: string) => void; disabled?: boolean; error?: boolean
}) {
  const refs = useRef<Array<TextInput | null>>([])
  const chars = Array.from({ length: 6 }, (_, i) => value[i] ?? '')

  const setDigit = (i: number, t: string) => {
    const d = t.replace(/\D/g, '').slice(-1)
    const arr = [...chars]
    arr[i] = d
    const next = arr.join('')
    onChange(next)
    if (d && i < 5) refs.current[i + 1]?.focus()
    if (next.length === 6 && !next.includes('')) onComplete(next)
  }

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg }}>
      {chars.map((ch, i) => (
        <TextInput
          key={i}
          ref={(r) => { refs.current[i] = r }}
          value={ch}
          onChangeText={(t) => setDigit(i, t)}
          onKeyPress={(e) => { if (e.nativeEvent.key === 'Backspace' && !ch && i > 0) refs.current[i - 1]?.focus() }}
          keyboardType="number-pad"
          maxLength={1}
          editable={!disabled}
          selectionColor={colors.accent}
          style={{
            width: 46, height: 58,
            textAlign: 'center', fontSize: 24, fontWeight: '700',
            color: colors.text,
            borderBottomWidth: 2,
            borderBottomColor: error ? colors.negative : ch ? colors.accent : colors.borderStrong,
          }}
        />
      ))}
    </View>
  )
}

function Divider({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl }}>
      <Text variant="eyebrow" tone="subtle">{label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
    </View>
  )
}

function Row2({ label }: { label: string }) {
  return <Text variant="small" tone="muted">{label}</Text>
}

function ReviewRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.listRow(), !last && styles.listRowDivider()]}>
      <Text variant="small" tone="muted" style={{ flex: 1 }}>{label}</Text>
      <Text variant="bodyStrong" style={{ flex: 2, textAlign: 'right' }} numberOfLines={1}>{value || '—'}</Text>
    </View>
  )
}

// Functions (not module-scope StyleSheet) so the palette proxy is read fresh
// per render — this is what keeps dark mode correct.
const styles = {
  backBtn: () => ({
    width: 40, height: 40, borderRadius: radii.pill,
    alignItems: 'center' as const, justifyContent: 'center' as const,
    backgroundColor: colors.bgSubtle,
  }),
  listCard: () => ({
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg,
    backgroundColor: colors.surface, overflow: 'hidden' as const,
  }),
  listRow: () => ({
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const,
    paddingVertical: spacing.lg, paddingHorizontal: spacing.lg,
  }),
  listRowDivider: () => ({ borderBottomWidth: 1, borderBottomColor: colors.border }),
  radioOuter: (selected: boolean) => ({
    width: 22, height: 22, borderRadius: radii.pill,
    borderWidth: 2, borderColor: selected ? colors.accent : colors.borderStrong,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  }),
  radioDot: () => ({ width: 10, height: 10, borderRadius: radii.pill, backgroundColor: colors.accent }),
  banner: (ok: boolean) => ({
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md,
    padding: spacing.lg, borderRadius: radii.lg,
    backgroundColor: ok ? colors.positiveSubtle : colors.accentSubtle,
  }),
  uploadNote: () => ({
    flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: spacing.md,
    marginTop: spacing.xl, padding: spacing.lg, borderRadius: radii.lg,
    backgroundColor: colors.bgMuted,
  }),
  bottomBar: () => ({
    paddingHorizontal: spacing.xl, paddingTop: spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.bg,
  }),
}
