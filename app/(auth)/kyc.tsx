import { useEffect, useRef, useState } from 'react'
import {
  View, KeyboardAvoidingView, Platform, Pressable, TextInput, ScrollView, Modal, Image,
  AppState, Linking,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { MotiView } from 'moti'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { initiateBvn, confirmBvnOtp, type BvnProfile } from '@/lib/nibssApi'
import { createBrokerAccount } from '@/lib/pacApi'
import { uploadKycSelfie } from '@/lib/kycUpload'
import { finalizeKyc } from '@/lib/kycFinalize'
import {
  validateBvn, validateOtp, validateFullName, validateDob,
  validateAddress, validateNigerianPhone,
} from '@/lib/validation'
import { Text, Button, Icon } from '@/ui'
import { colors, spacing, radii } from '@/theme'
import { NG_BANKS } from '@/lib/banks'
import { resolveAccountName } from '@/lib/bankApi'
import { useShallow } from 'zustand/react/shallow'

type Step = 1 | 2 | 3 | 4 | 5

const STEP_META: Record<Step, { title: string; subtitle: string }> = {
  1: { title: 'Let’s verify it’s you', subtitle: 'Confirm your BVN, then a few personal details.' },
  2: { title: 'Settlement account',     subtitle: 'The bank account for sale proceeds & withdrawals.' },
  3: { title: 'Next of kin',            subtitle: 'A contact and your mother’s maiden name, required by the exchange.' },
  4: { title: 'Confirm your details',   subtitle: 'Check everything is correct before we take your photo.' },
  5: { title: 'Take a selfie',          subtitle: 'A quick photo to confirm it’s really you. Look at the camera.' },
}

// Auto-insert the dashes in a YYYY-MM-DD date as the user types digits (#15),
// so they never have to type the separators or fight autocorrect.
function formatDobInput(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8) // YYYYMMDD
  const y = d.slice(0, 4)
  const m = d.slice(4, 6)
  const day = d.slice(6, 8)
  let out = y
  if (d.length > 4) out += '-' + m
  if (d.length > 6) out += '-' + day
  return out
}

export default function KycScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user, loadProfile, ensureWallet, kycStatus } = useAuthStore(useShallow((s) => ({ user: s.user, loadProfile: s.loadProfile, ensureWallet: s.ensureWallet, kycStatus: s.kycStatus })))

  // Skipping BVN verification skips KYC entirely (no manual-entry form) and
  // lands on Home, which shows a "Finish setting up" prompt to come back.
  // Only a brand-new user is marked 'skipped'; someone redoing KYC keeps
  // their current status and simply returns home.
  const [skipping, setSkipping] = useState(false)
  async function skipToHome() {
    if (skipping) return
    setSkipping(true)
    try {
      if (user && (!kycStatus || kycStatus === 'pending')) {
        await supabase.from('profiles').update({ kyc_status: 'skipped' }).eq('id', user.id)
        await loadProfile()
      }
    } finally {
      setSkipping(false)
      router.replace('/(app)')
    }
  }
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
  // the exact surname / first name NIBSS returned).
  const [bvnProfile, setBvnProfile] = useState<BvnProfile | null>(null)

  // Step 2 — settlement (bank) account. This is the PAC account-opening form's
  // "BANK ACCOUNT DETAILS": where sale proceeds / withdrawals are paid out. It
  // is NOT the Moneta funding wallet. Reviewed by PAC on the partner dashboard.
  const [bankName, setBankName] = useState('')
  const [bankCode, setBankCode] = useState('')   // 3-digit CBN code for the selected bank
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName] = useState('')
  // Account name-enquiry (#18): 'idle' | 'resolving' | 'resolved' | 'manual'.
  // 'resolved' = server confirmed the name (field locks read-only); 'manual' =
  // enquiry unavailable/failed, so the user types the name themselves.
  const [nameStatus, setNameStatus] = useState<'idle' | 'resolving' | 'resolved' | 'manual'>('idle')

  // Step 3 — next of kin + mother's maiden name (required on the PAC form)
  const [nextOfKinName, setNextOfKinName] = useState('')
  const [nextOfKinPhone, setNextOfKinPhone] = useState('')
  const [motherMaidenName, setMotherMaidenName] = useState('')

  // Step 4 — review / submit
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Step 5 — selfie
  const [selfieUri, setSelfieUri] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [camPermission, requestCamPermission, getCamPermission] = useCameraPermissions()
  const cameraRef = useRef<CameraView>(null)
  // The preview must be running before takePictureAsync — tapping the shutter
  // in the first moment (or right after Retake remounts the camera) threw
  // "camera is not running" on Android. Shutter stays dimmed until ready.
  const [camReady, setCamReady] = useState(false)

  // Per-field validation errors so skipping BVN (or any invalid personal /
  // settlement field) shows exactly what's wrong instead of a silently
  // disabled Continue button (#16).
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({})
  const clearErr = (k: string) => setFieldErr(prev => { if (!prev[k]) return prev; const { [k]: _, ...rest } = prev; return rest })
  const [bankPickerOpen, setBankPickerOpen] = useState(false)

  // Prefill name + phone captured at registration so a user who skips BVN
  // verification doesn't retype them (#13). Only fills empties, so a NIBSS
  // pull or the user's own edits always win.
  useEffect(() => {
    const meta = (user?.user_metadata ?? {}) as { full_name?: string; phone?: string }
    if (meta.full_name) setFullName(prev => prev || meta.full_name!)
    if (meta.phone) setPhone(prev => prev || meta.phone!)
  }, [user])

  // KYC redo (e.g. after a CSCS rejection): prefill everything already on file so
  // the user only fixes what was wrong instead of retyping the whole form (web
  // does the same). Only fills empties — a fresh BVN pull or the user's own edits
  // always win. BVN itself is never prefilled (it must be re-verified by OTP).
  useEffect(() => {
    if (!user) return
    let cancelled = false
    supabase.from('profiles')
      .select('full_name, date_of_birth, address, phone, settlement_bank_name, settlement_account_number, settlement_account_name, next_of_kin_name, next_of_kin_phone, mother_maiden_name')
      .eq('id', user.id)
      .single()
      .then(({ data: p }) => {
        if (cancelled || !p) return
        const fill = (set: (fn: (prev: string) => string) => void, v: string | null | undefined) => { if (v) set(prev => prev || v) }
        fill(setFullName, p.full_name)
        fill(setDob, p.date_of_birth)
        fill(setAddress, p.address)
        fill(setPhone, p.phone)
        const bank = NG_BANKS.find(b => b.name === p.settlement_bank_name)
        if (bank) { setBankName(prev => prev || bank.name); setBankCode(prev => prev || bank.bankCode) }
        fill(setAccountNumber, p.settlement_account_number)
        fill(setAccountName, p.settlement_account_name)
        fill(setNextOfKinName, p.next_of_kin_name)
        fill(setNextOfKinPhone, p.next_of_kin_phone)
        fill(setMotherMaidenName, p.mother_maiden_name)
      })
    return () => { cancelled = true }
  }, [user])

  // Ask for camera permission the moment the user reaches the selfie step, so the
  // live camera appears without an extra tap (falls back to the Allow button if
  // the OS prompt was previously dismissed).
  // Auto-asks ONCE per visit to the step: on Android a first "Deny" leaves
  // canAskAgain=true, so re-asking on every permission change would re-pop the
  // dialog in a loop. After that the user drives it with the Allow button.
  const camAutoAsked = useRef(false)
  useEffect(() => {
    if (step !== 5) { camAutoAsked.current = false; setCamReady(false); return }
    if (camAutoAsked.current) return
    if (camPermission && !camPermission.granted && camPermission.canAskAgain) {
      camAutoAsked.current = true
      requestCamPermission()
    }
  }, [step, camPermission, requestCamPermission])

  // Re-read the permission when the user comes back from Settings, so enabling
  // the camera there takes effect immediately instead of leaving a dead prompt.
  useEffect(() => {
    if (step !== 5) return
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') getCamPermission() })
    return () => sub.remove()
  }, [step, getCamPermission])

  // Once the OS has permanently blocked the camera, request() is a silent no-op —
  // the only way forward is the system Settings page.
  const cameraBlocked = !!camPermission && !camPermission.granted && !camPermission.canAskAgain
  const onAllowCamera = () => { if (cameraBlocked) Linking.openSettings(); else requestCamPermission() }

  // Name-enquiry (#18): once a bank is picked and the NUBAN is 10 digits, resolve
  // the account holder's name via the NIBSS debit-instruction enquiry and lock
  // the field. That service REQUIRES the BVN (it also confirms the account is
  // tied to that BVN), so we only attempt it when we have an 11-digit BVN —
  // a user who skipped BVN just types the name manually. Any failure (route not
  // deployed yet, unverifiable MFB, mismatch) falls back to manual entry so KYC
  // never blocks.
  useEffect(() => {
    if (accountNumber.length !== 10 || !bankCode) { setNameStatus('idle'); return }
    const bank = NG_BANKS.find(b => b.bankCode === bankCode)
    // Only auto-resolve when we hold a genuinely VERIFIED BVN (OTP-confirmed in
    // step 1). The enquiry is a BVN⇄account match, so a typed-but-unverified or
    // skipped BVN would just produce a confusing "not verified" — those users
    // type the account name manually instead.
    if (!bank || !bvnDone || !/^\d{11}$/.test(bvn)) { setNameStatus('manual'); return }
    let cancelled = false
    setNameStatus('resolving')
    resolveAccountName({ accountNumber, institutionCode: bank.institutionCode, bvn })
      .then(r => {
        if (cancelled) return
        if (r.verified && r.name) { setAccountName(r.name); setNameStatus('resolved'); clearErr('accountName') }
        else setNameStatus('manual')
      })
      .catch(() => { if (cancelled) return; setNameStatus('manual') })
    return () => { cancelled = true }
  }, [accountNumber, bankCode, bvn, bvnDone])

  useEffect(() => {
    if (!bvnRef) { setOtpWaitSec(0); return }
    const readyAt = Date.now() + 35_000   // lock the OTP input for 35s after it's sent (matches web)
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

  // Validate step 1 and surface a per-field error for anything invalid, so a
  // user who skipped BVN sees why Continue won't advance (#16). Returns true
  // when the step is complete.
  function validateStep1(): boolean {
    const errs: Record<string, string> = {}
    if (!bvnDone) errs.bvn = 'Verify your BVN to continue, or tap “Skip KYC for now” to do it later'
    const name = validateFullName(fullName); if (!name.ok) errs.fullName = name.error
    const dobV = validateDob(dob);           if (!dobV.ok) errs.dob = dobV.error
    const addrV = validateAddress(address);  if (!addrV.ok) errs.address = addrV.error
    const phV = validateNigerianPhone(phone);if (!phV.ok) errs.phone = phV.error
    setFieldErr(errs)
    return Object.keys(errs).length === 0
  }

  function validateStep2(): boolean {
    const errs: Record<string, string> = {}
    if (bankName.trim().length < 2) errs.bankName = 'Select your settlement bank'
    if (!/^\d{10}$/.test(accountNumber)) errs.accountNumber = 'Account number must be 10 digits'
    if (accountName.trim().length < 2) errs.accountName = 'Enter the name on the account'
    setFieldErr(errs)
    return Object.keys(errs).length === 0
  }

  function validateStep3(): boolean {
    const errs: Record<string, string> = {}
    if (nextOfKinName.trim().length < 2) errs.nextOfKinName = "Enter your next of kin's name"
    if (!/^\+?\d[\d\s-]{7,}$/.test(nextOfKinPhone.trim())) errs.nextOfKinPhone = 'Enter a valid phone number'
    if (motherMaidenName.trim().length < 2) errs.motherMaidenName = "Enter your mother's maiden name"
    setFieldErr(errs)
    return Object.keys(errs).length === 0
  }

  const captureSelfie = async () => {
    if (!cameraRef.current || capturing || !camReady) return
    setCapturing(true)
    setSubmitError(null)
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.55 })
      if (photo?.uri) { setSelfieUri(photo.uri); setCamReady(false) }
    } catch {
      setSubmitError('Could not take the photo. Try again.')
    } finally {
      setCapturing(false)
    }
  }
  const retakeSelfie = () => { setCamReady(false); setSelfieUri(null); setSubmitError(null) }

  async function submit() {
    if (!user) return
    const name    = validateFullName(fullName)
    const dobV    = validateDob(dob)
    const addrV   = validateAddress(address)
    const phoneV  = validateNigerianPhone(phone)
    const bvnV    = bvnSkipped ? { ok: true, value: '' } as const : validateBvn(bvn)

    const firstFail = [name, dobV, addrV, phoneV, bvnV].find(r => !r.ok)
    if (firstFail && !firstFail.ok) { setSubmitError(firstFail.error); return }
    if (!name.ok || !dobV.ok || !addrV.ok || !phoneV.ok || !bvnV.ok) return

    // Settlement (bank) account — PAC form's "BANK ACCOUNT DETAILS".
    const acctName = accountName.trim()
    const acctNo   = accountNumber.replace(/\D/g, '')
    const bank     = bankName.trim()
    if (acctName.length < 2 || acctName.length > 120) { setSubmitError('Enter the account name on your settlement account'); return }
    if (!/^\d{10}$/.test(acctNo))                     { setSubmitError('Settlement account number must be 10 digits'); return }
    if (bank.length < 2 || bank.length > 80)          { setSubmitError('Enter your settlement bank'); return }

    if (!selfieUri) { setSubmitError('Take a verification selfie to continue'); setStep(5); return }

    setSaving(true); setSubmitError(null)
    try {
      // Upload the KYC selfie to Storage first; its path is saved on the profile
      // and shown on the partner dashboard. A failure here blocks submission so
      // we never create a broker account without the verification photo.
      let selfiePath: string
      try {
        selfiePath = await uploadKycSelfie(selfieUri, user.id)
      } catch {
        throw new Error('Could not upload your selfie. Check your connection and retake it.')
      }

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

      const { error: dbError } = await supabase.from('profiles').upsert({
        id: user.id,
        full_name: name.value,
        date_of_birth: dobV.value,
        address: addrV.value,
        phone: phoneV.value,
        kyc_status: 'submitted',
        // Verification selfie (Storage path) — shown on the partner dashboard.
        selfie_path: selfiePath,
        // Settlement (bank) account — reviewed on the PAC partner dashboard.
        settlement_account_name:   acctName,
        settlement_account_number: acctNo,
        settlement_bank_name:      bank,
        // Next of kin + mother's maiden name (PAC form requirements).
        next_of_kin_name:   nextOfKinName.trim(),
        next_of_kin_phone:  nextOfKinPhone.trim(),
        mother_maiden_name: motherMaidenName.trim(),
        // Only overwrite the BVN when actually provided this run.
        ...(bvnV.value ? { bvn: bvnV.value } : {}),
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
      })

      // Identity is verified and the broker account exists, but the CSCS
      // account still needs a PAC reviewer to approve it on the partner
      // dashboard. Mark it 'pending' so the app shows "CSCS under review" until
      // the reviewer flips it to 'approved' (which unlocks trading) or
      // 'rejected'. A redo re-runs this whole flow → back to 'pending'.
      // Goes through the web's shared finalize route, which also emails the
      // KYC PDF to PAC (same as a web signup).
      await finalizeKyc(user.id, pacAccountId)

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

  // CTA is always pressable so validation can run and show errors (#16),
  // rather than a silently-disabled button with no feedback.
  const cta =
    step === 1 ? { label: 'Continue', disabled: false, loading: false, onPress: () => { if (validateStep1()) setStep(2) } }
    : step === 2 ? { label: 'Continue', disabled: false, loading: false, onPress: () => { if (validateStep2()) setStep(3) } }
    : step === 3 ? { label: 'Continue', disabled: false, loading: false, onPress: () => { if (validateStep3()) setStep(4) } }
    : step === 4 ? { label: 'Continue', disabled: false, loading: false, onPress: () => setStep(5) }
    // Step 5 (selfie): can't submit until a photo is taken.
    : { label: saving ? 'Submitting…' : 'Submit KYC', disabled: saving || !selfieUri, loading: saving, onPress: submit }

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
            <Text variant="eyebrow" tone="muted">STEP {step} / 5</Text>
            {/* Skip is available at every step — goes home, finish KYC later. */}
            <Pressable onPress={skipToHome} disabled={skipping} hitSlop={10} accessibilityRole="button">
              <Text variant="smallStrong" tone="muted">{skipping ? '…' : 'Skip KYC for now'}</Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', gap: 6, marginTop: spacing.md }}>
            {[1, 2, 3, 4, 5].map(n => (
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
                  error={bvnError && !bvnRef ? bvnError : (fieldErr.bvn ?? null)}
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
                    <Row2 label={otpWaitSec > 0 ? `Code sent. Ready in ${otpWaitSec}s` : 'Enter the 6-digit code sent to your BVN phone'} />
                    <OtpBoxes
                      value={otp}
                      disabled={otpLoading || otpWaitSec > 0}
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
                    </View>
                    <Text variant="small" tone="subtle" style={{ marginTop: spacing.md }}>
                      Didn’t get the code? Tap “Skip KYC for now” at the top and finish verifying later.
                    </Text>
                  </MotiView>
                )}

                {/* Personal details reveal once BVN is settled */}
                {(bvnDone || bvnSkipped) && (
                  <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 320 }}>
                    <Divider label="Your details" />
                    <UField label="Full name" value={fullName} onChangeText={(v: string) => { setFullName(v); clearErr('fullName') }} placeholder="Your full name" autoCapitalize="words" error={fieldErr.fullName} />
                    <UField label="Date of birth" value={dob} onChangeText={(v: string) => { setDob(formatDobInput(v)); clearErr('dob') }} placeholder="YYYY-MM-DD" keyboardType="number-pad" maxLength={10} error={fieldErr.dob} />
                    <UField label="Residential address" value={address} onChangeText={(v: string) => { setAddress(v); clearErr('address') }} placeholder="Where you live" autoCapitalize="words" error={fieldErr.address} />
                    <UField label="Phone number" value={phone} onChangeText={(v: string) => { setPhone(v); clearErr('phone') }} placeholder="e.g. 08012345678" keyboardType="phone-pad" autoComplete="tel" error={fieldErr.phone} />
                  </MotiView>
                )}
              </View>
            )}

            {/* ───────────────────────── STEP 2 ───────────────────────── */}
            {step === 2 && (
              <View>
                <Divider label="Settlement bank account" />
                <View style={styles.uploadNote()}>
                  <Icon name="solar:info-circle-linear" size={18} color={colors.textMuted} />
                  <Text variant="small" tone="muted" style={{ flex: 1 }}>
                    Where your sale proceeds and withdrawals are paid out. Use an account in your own name.
                  </Text>
                </View>
                <View style={{ height: spacing.xl }} />

                {/* Bank picker (#18) — dropdown instead of free text. */}
                <View style={{ marginBottom: spacing['2xl'] }}>
                  <Text variant="eyebrow" tone="muted" style={{ marginBottom: spacing.md }}>BANK NAME</Text>
                  <Pressable
                    onPress={() => setBankPickerOpen(true)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      borderBottomWidth: 2, borderBottomColor: fieldErr.bankName ? colors.negative : colors.borderStrong,
                      paddingBottom: spacing.sm,
                    }}
                  >
                    <Text variant="body" style={{ fontSize: 18, fontWeight: '600', color: bankName ? colors.text : colors.textSubtle }}>
                      {bankName || 'Select your bank'}
                    </Text>
                    <Icon name="solar:alt-arrow-down-linear" size={20} color={colors.textMuted} />
                  </Pressable>
                  {fieldErr.bankName ? <Text variant="small" tone="negative" style={{ marginTop: spacing.sm }}>{fieldErr.bankName}</Text> : null}
                </View>

                <UField
                  label="Account number"
                  value={accountNumber}
                  onChangeText={(v: string) => {
                    setAccountNumber(v.replace(/\D/g, '').slice(0, 10))
                    clearErr('accountNumber')
                    // Any edit invalidates a previously-resolved name.
                    if (nameStatus === 'resolved') { setAccountName(''); setNameStatus('idle') }
                  }}
                  placeholder="10 digits"
                  keyboardType="number-pad"
                  maxLength={10}
                  error={fieldErr.accountNumber}
                />

                {nameStatus === 'resolving' ? (
                  <Text variant="small" tone="muted" style={{ marginTop: -spacing.md, marginBottom: spacing['2xl'] }}>Verifying account…</Text>
                ) : nameStatus === 'resolved' ? (
                  <View style={{ marginBottom: spacing['2xl'] }}>
                    <Text variant="eyebrow" tone="muted" style={{ marginBottom: spacing.sm }}>ACCOUNT NAME</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Icon name="solar:verified-check-bold" size={18} color={colors.positive} />
                      <Text variant="bodyStrong" style={{ flex: 1 }}>{accountName}</Text>
                    </View>
                  </View>
                ) : (
                  <UField
                    label="Account name"
                    value={accountName}
                    onChangeText={(v: string) => { setAccountName(v); clearErr('accountName') }}
                    placeholder="Name on the account"
                    autoCapitalize="words"
                    error={fieldErr.accountName}
                  />
                )}
              </View>
            )}

            {/* ───────────────────────── STEP 3 — next of kin ───────────────────────── */}
            {step === 3 && (
              <View>
                <UField
                  label="Next of kin's full name"
                  value={nextOfKinName}
                  onChangeText={(v: string) => { setNextOfKinName(v); clearErr('nextOfKinName') }}
                  placeholder="Full name of your next of kin"
                  autoCapitalize="words"
                  error={fieldErr.nextOfKinName}
                />
                <UField
                  label="Next of kin's phone number"
                  value={nextOfKinPhone}
                  onChangeText={(v: string) => { setNextOfKinPhone(v); clearErr('nextOfKinPhone') }}
                  placeholder="e.g. 08012345678"
                  keyboardType="phone-pad"
                  error={fieldErr.nextOfKinPhone}
                />
                <UField
                  label="Mother's maiden name"
                  value={motherMaidenName}
                  onChangeText={(v: string) => { setMotherMaidenName(v); clearErr('motherMaidenName') }}
                  placeholder="Your mother's maiden name"
                  autoCapitalize="words"
                  error={fieldErr.motherMaidenName}
                />
              </View>
            )}

            {/* ───────────────────────── STEP 4 — review ───────────────────────── */}
            {step === 4 && (
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
                  <ReviewRow label="Settlement bank" value={bankName} />
                  <ReviewRow label="Account number" value={accountNumber} />
                  <ReviewRow label="Account name" value={accountName} />
                  <ReviewRow label="Next of kin" value={nextOfKinName} />
                  <ReviewRow label="Next of kin phone" value={nextOfKinPhone} />
                  <ReviewRow label="Mother's maiden name" value={motherMaidenName} last />
                </View>

                <View style={styles.uploadNote()}>
                  <Icon name="solar:camera-linear" size={18} color={colors.textMuted} />
                  <Text variant="small" tone="muted" style={{ flex: 1 }}>
                    Next, we’ll take a quick verification selfie, then create your brokerage account.
                  </Text>
                </View>

                {submitError && <Text variant="small" tone="negative" style={{ marginTop: spacing.lg }}>{submitError}</Text>}
              </View>
            )}

            {/* ───────────────────────── STEP 5 — selfie ───────────────────────── */}
            {step === 5 && (
              <View style={{ alignItems: 'center' }}>
                <View style={styles.selfieFrame()}>
                  {selfieUri ? (
                    <Image source={{ uri: selfieUri }} style={styles.selfieImage} resizeMode="cover" />
                  ) : camPermission?.granted ? (
                    <CameraView
                      ref={cameraRef}
                      style={styles.selfieImage}
                      facing="front"
                      onCameraReady={() => setCamReady(true)}
                      onMountError={() => { setCamReady(false); setSubmitError('Could not start the camera. Close other apps using it and try again.') }}
                    />
                  ) : (
                    <View style={styles.selfiePermission()}>
                      <Icon name="solar:camera-bold" size={40} color={colors.textMuted} />
                      <Text variant="small" tone="muted" align="center" style={{ marginTop: spacing.md, paddingHorizontal: spacing.xl }}>
                        {cameraBlocked
                          ? 'Camera access is off for ETICO. Turn it on in Settings, then come back.'
                          : 'We need your camera to take a verification selfie.'}
                      </Text>
                      <View style={{ height: spacing.lg }} />
                      <Button title={cameraBlocked ? 'Open Settings' : 'Allow camera'} size="sm" fullWidth={false} onPress={onAllowCamera} />
                    </View>
                  )}
                </View>

                <Text variant="small" tone="muted" align="center" style={{ marginTop: spacing.xl, paddingHorizontal: spacing.lg }}>
                  Center your face, good lighting, no hat or glasses. This photo is only used to verify your identity.
                </Text>

                <View style={{ height: spacing.xl }} />

                {selfieUri ? (
                  <Pressable onPress={retakeSelfie} hitSlop={8} style={styles.retakeBtn()}>
                    <Icon name="solar:refresh-linear" size={18} color={colors.text} />
                    <Text variant="smallStrong">Retake photo</Text>
                  </Pressable>
                ) : camPermission?.granted ? (
                  <Pressable onPress={captureSelfie} disabled={capturing || !camReady} accessibilityRole="button" accessibilityLabel="Take selfie" style={[styles.shutterOuter(), !camReady && { opacity: 0.4 }]}>
                    <View style={[styles.shutterInner(), capturing && { opacity: 0.5 }]} />
                  </Pressable>
                ) : null}

                {submitError && <Text variant="small" tone="negative" align="center" style={{ marginTop: spacing.lg }}>{submitError}</Text>}
              </View>
            )}
          </MotiView>
        </ScrollView>

        {/* ── Sticky bottom CTA ── */}
        <View style={[styles.bottomBar(), { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <Button title={cta.label} onPress={cta.onPress} disabled={cta.disabled} loading={cta.loading} />
        </View>
      </KeyboardAvoidingView>

      {/* Bank picker (#18) */}
      <Modal visible={bankPickerOpen} transparent animationType="slide" onRequestClose={() => setBankPickerOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' }} onPress={() => setBankPickerOpen(false)}>
          <Pressable
            onPress={() => {}}
            style={{
              maxHeight: '72%', backgroundColor: colors.surfaceRaised,
              borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
              paddingTop: spacing.lg, paddingBottom: Math.max(insets.bottom, spacing.xl),
            }}
          >
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.lg }} />
            <Text variant="h3" style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>Select your bank</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {NG_BANKS.map((b, i) => {
                const selected = b.name === bankName
                return (
                  <Pressable
                    key={b.bankCode}
                    onPress={() => { setBankName(b.name); setBankCode(b.bankCode); setAccountName(''); setNameStatus('idle'); clearErr('bankName'); setBankPickerOpen(false) }}
                    style={({ pressed }) => [
                      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.lg, paddingHorizontal: spacing.xl },
                      i < NG_BANKS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                      pressed && { backgroundColor: colors.bgMuted },
                    ]}
                  >
                    <Text variant="body" style={{ color: selected ? colors.accent : colors.text }}>{b.name}</Text>
                    {selected && <Icon name="solar:check-circle-bold" size={20} color={colors.accent} />}
                  </Pressable>
                )
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
      <Text variant="bodyStrong" style={{ flex: 2, textAlign: 'right' }} numberOfLines={1}>{value || '-'}</Text>
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
  selfieFrame: () => ({
    width: 260, height: 320, borderRadius: 24, overflow: 'hidden' as const,
    backgroundColor: colors.bgMuted,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  }),
  selfieImage: { width: '100%' as const, height: '100%' as const },
  selfiePermission: () => ({
    flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const,
    paddingHorizontal: spacing.lg,
  }),
  retakeBtn: () => ({
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
    gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.xl,
    borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.bgSubtle,
  }),
  shutterOuter: () => ({
    width: 74, height: 74, borderRadius: 37,
    borderWidth: 4, borderColor: colors.brand,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  }),
  shutterInner: () => ({
    width: 58, height: 58, borderRadius: 29, backgroundColor: colors.brand,
  }),
}
