import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { User, Session } from '@supabase/supabase-js'
import {
  validateEmail, validatePassword, validateFullName,
  validateNigerianPhone,
} from '@/lib/validation'
import { usePinStore } from '@/store/pinStore'
import { createVirtualAccount, fundWalletFromVa as fundWalletFromVaApi } from '@/lib/monetaApi'
import { getAccountById } from '@/lib/pacApi'
import { config } from '@/lib/config'
// NOTE: `usePortfolioStore` is imported lazily inside `signOut` to avoid a
// module-load circular import (portfolioStore already imports this file).

type KycStatus  = 'pending' | 'submitted' | 'verified' | 'rejected'
type CacsStatus = 'not_submitted' | 'pending' | 'approved' | 'rejected'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  profileReady: boolean
  pacAccountId: string | null
  kycStatus: KycStatus
  cacsStatus: CacsStatus
  cacsDocUrl: string | null
  cacsRejectionReason: string | null
  cscsNumber: string | null    // CSCS number entered by PAC on approval
  walletBalance: number       // live PAC trading-wallet balance (buying power)
  vaAvailable: number         // Virtual Account balance available to fund the wallet
  hasPin: boolean
  // Moneta virtual account (wallet)
  vaReference: string | null
  vaNumber: string | null
  vaBank: string | null
  vaAccountName: string | null

  setSession: (session: Session | null) => void
  signIn: (email: string, password: string) => Promise<string | null>
  // Resolves { error } on failure; { error: null, signedIn } on success. signedIn
  // is true when the account was created pre-confirmed and a session is live.
  signUp: (email: string, password: string, fullName: string, phone?: string) => Promise<{ error: string | null; signedIn: boolean }>
  signOut: () => Promise<void>
  loadProfile: () => Promise<void>
  // Lazily create the Moneta VA from the user's KYC identity, then persist it.
  ensureWallet: () => Promise<void>
  // Pull the LIVE PAC account cash balance and reflect it in walletBalance.
  // The wallet is a mirror of the user's PAC account — not a separate ledger.
  refreshWalletBalance: () => Promise<void>
  // Re-read the Virtual Account balance (va_available) from the profile.
  refreshVaAvailable: () => Promise<void>
  // Move `amountNaira` from the VA into the PAC trading wallet (fires the
  // cash_transactions endpoint server-side). Updates vaAvailable + walletBalance.
  fundWalletFromVa: (amountNaira: number) => Promise<void>
}

// Single-flight guard for loadProfile — see comment in loadProfile.
let _loadProfileInFlight: Promise<void> | null = null
// Single-flight guard for ensureWallet — the Wallet screen can mount/refresh
// several times; without this we'd create duplicate virtual accounts.
let _ensureWalletInFlight: Promise<void> | null = null

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  profileReady: false,
  pacAccountId: null,
  kycStatus: 'pending',
  cacsStatus: 'not_submitted',
  cacsDocUrl: null,
  cacsRejectionReason: null,
  cscsNumber: null,
  walletBalance: 0,
  vaAvailable: 0,
  hasPin: false,
  vaReference: null,
  vaNumber: null,
  vaBank: null,
  vaAccountName: null,

  setSession: (session) => {
    set({ session, user: session?.user ?? null, loading: false })
    if (session?.user) get().loadProfile()
  },

  signIn: async (email, password) => {
    const em = validateEmail(email)
    if (!em.ok) return em.error
    // Don't validate password strength on sign-in (users with old pw need to log in);
    // just guard against absurdly long inputs.
    if (typeof password !== 'string' || password.length === 0) return 'Password is required'
    if (password.length > 72) return 'Password is too long'
    const { error } = await supabase.auth.signInWithPassword({
      email: em.value,
      password,
    })
    return error?.message ?? null
  },

  signUp: async (email, password, fullName, phone) => {
    const fail = (error: string) => ({ error, signedIn: false })
    const em = validateEmail(email)
    if (!em.ok) return fail(em.error)
    const pw = validatePassword(password)
    if (!pw.ok) return fail(pw.error)
    const name = validateFullName(fullName)
    if (!name.ok) return fail(name.error)
    // Phone is optional at sign-up but validated when present. Stored in
    // user_metadata so the KYC screen can prefill it (esp. when the user skips
    // BVN verification and we have no NIBSS record to pull it from).
    let phoneValue: string | undefined
    if (phone && phone.trim()) {
      const ph = validateNigerianPhone(phone)
      if (!ph.ok) return fail(ph.error)
      phoneValue = ph.value
    }

    // Same path as web (Niqra-web /api/auth/signup): the account is created
    // ALREADY CONFIRMED server-side — no Supabase confirmation email, no
    // activation links that go stale, a clean "already exists" error, and our
    // branded welcome email. Then sign straight in; AuthGate routes to PIN setup.
    let routeReachable = true
    try {
      const res = await fetch(`${config.siteBase}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: name.value, email: em.value, password: pw.value, phone: phoneValue }),
      })
      if (res.status === 404 || res.status >= 500) routeReachable = false
      else {
        let j: { ok?: boolean; error?: string } = {}
        try { j = await res.json() } catch { /* keep default */ }
        if (!res.ok || !j.ok) {
          if (res.status === 429) return fail('Too many sign-up attempts. Please wait a few minutes and try again.')
          return fail(j.error ?? `Couldn't create your account (${res.status})`)
        }
        const { error: signErr } = await supabase.auth.signInWithPassword({ email: em.value, password: pw.value })
        // Account exists and is confirmed either way; if sign-in hiccups the user
        // just signs in manually.
        return { error: null, signedIn: !signErr }
      }
    } catch {
      routeReachable = false
    }

    // Fallback (web route unreachable): legacy Supabase sign-up with email confirmation.
    if (!routeReachable) {
      const { error } = await supabase.auth.signUp({
        email: em.value,
        password: pw.value,
        options: { data: { full_name: name.value, ...(phoneValue ? { phone: phoneValue } : {}) } },
      })
      return { error: error?.message ?? null, signedIn: false }
    }
    return fail('Could not create your account')
  },

  signOut: async () => {
    // Wipe local stores FIRST. `supabase.auth.signOut()` fires the
    // onAuthStateChange listener synchronously — that listener calls
    // setSession(null), which flips `user` to null and immediately triggers
    // AuthGate's redirect to /(auth)/login. If portfolio + PIN stores are
    // still populated at that point, the next user (or the login screen
    // itself) can briefly see the previous user's positions / cash / KYC
    // status.
    usePinStore.getState().lock()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { usePortfolioStore } = require('@/store/portfolioStore') as typeof import('@/store/portfolioStore')
    usePortfolioStore.getState().reset()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useWatchlistStore } = require('@/store/watchlistStore') as typeof import('@/store/watchlistStore')
    useWatchlistStore.getState().reset()
    set({
      user: null, session: null, pacAccountId: null,
      kycStatus: 'pending', cacsStatus: 'not_submitted',
      cacsDocUrl: null, cacsRejectionReason: null, cscsNumber: null,
      walletBalance: 0, vaAvailable: 0, profileReady: false, hasPin: false,
      vaReference: null, vaNumber: null, vaBank: null, vaAccountName: null,
    })
    // scope:'local' clears the token from expo-secure-store on this device
    // without invalidating other sessions the user may have (mobile + web).
    // We must await this — a background re-hydrate from SecureStore can
    // otherwise race the local wipe and briefly restore the old session.
    try { await supabase.auth.signOut({ scope: 'local' }) }
    catch (e) { console.warn('[signOut] supabase error:', e) }
  },

  loadProfile: async () => {
    const { user } = get()
    if (!user) return
    // Single-flight: setSession → onAuthStateChange → AppState.active can
    // all fire loadProfile concurrently. Out-of-order responses were
    // stomping kyc_status/hasPin/walletBalance and briefly kicking verified
    // users back to /(auth)/kyc.
    if (_loadProfileInFlight) return _loadProfileInFlight
    _loadProfileInFlight = (async () => {
    try {
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('pac_account_id, kyc_status, wallet_balance, va_available, cacs_status, cacs_doc_url, cacs_rejection_reason, cscs_number, email, has_pin, va_reference, va_number, va_bank, va_account_name')
      .eq('id', user.id)
      .single()

    if (profile) {
      if (!profile.email && user.email) {
        supabase.from('profiles').update({ email: user.email }).eq('id', user.id).then(() => {})
      }
      set({
        pacAccountId: profile.pac_account_id ?? null,
        kycStatus: (profile.kyc_status as KycStatus) ?? 'pending',
        cacsStatus: (profile.cacs_status as CacsStatus) ?? 'not_submitted',
        cacsDocUrl: profile.cacs_doc_url ?? null,
        cacsRejectionReason: profile.cacs_rejection_reason ?? null,
        cscsNumber: (profile as { cscs_number?: string | null }).cscs_number ?? null,
        walletBalance: profile.wallet_balance ?? 0,
        vaAvailable: profile.va_available ?? 0,
        hasPin: !!profile.has_pin,
        vaReference: profile.va_reference ?? null,
        vaNumber: profile.va_number ?? null,
        vaBank: profile.va_bank ?? null,
        vaAccountName: profile.va_account_name ?? null,
      })
      // wallet_balance above is only an instant-paint fallback. The wallet is a
      // mirror of the live PAC cash balance, so pull the real value now.
      if (profile.pac_account_id) get().refreshWalletBalance().catch(() => {})
    } else if (!fetchError || fetchError.code === 'PGRST116') {
      // Create the row for a brand-new user. Must be INSERT-only (DO NOTHING):
      // a plain upsert compiles to INSERT ... ON CONFLICT DO UPDATE, which needs
      // UPDATE privilege on every column in the payload — and wallet_balance's
      // UPDATE is revoked from clients (float-theft guard). Without ignoreDuplicates
      // the insert is denied and the profile never gets created, which then blocks
      // PIN setup and onboarding for every new account.
      const { error: createErr } = await supabase
        .from('profiles')
        .upsert(
          { id: user.id, email: user.email ?? null, kyc_status: 'pending', wallet_balance: 0 },
          { onConflict: 'id', ignoreDuplicates: true },
        )
      if (createErr) console.warn('[auth] profile create failed:', createErr.message)
    }
    set({ profileReady: true })
    } finally {
      _loadProfileInFlight = null
    }
    })()
    return _loadProfileInFlight
  },

  ensureWallet: async () => {
    const { user, vaReference } = get()
    if (!user) throw new Error('Not authenticated')
    if (vaReference) return                 // already provisioned
    if (_ensureWalletInFlight) return _ensureWalletInFlight

    _ensureWalletInFlight = (async () => {
      try {
        // Pull the KYC identity we already collected to create the VA.
        const { data: p } = await supabase
          .from('profiles')
          .select('full_name, first_name, surname, nin, bvn, id_type, id_number, va_reference')
          .eq('id', user.id)
          .single()

        // Another device may have created it between load and now.
        if (p?.va_reference) { await get().loadProfile(); return }

        const fullName = String(p?.full_name ?? user.user_metadata?.full_name ?? '').trim()
        // Prefer the exact names NIBSS returned; fall back to splitting full_name.
        const parts = fullName.split(/\s+/).filter(Boolean)
        const firstName = String(p?.first_name ?? '').trim() || parts[0] || ''
        const surname   = String(p?.surname ?? '').trim() || (parts.length > 1 ? parts[parts.length - 1] : parts[0]) || ''
        if (!firstName || !surname) throw new Error('Complete your profile before opening a wallet')

        // Moneta VA validation quirks:
        //  • account_name must be <= 8 characters (it's just a label; Moneta wraps
        //    it as "MONETA TECH(<merchant>-<account_name>)"), so cap it.
        //  • bvn must be exactly 11 digits, nin exactly 10 digits — real Nigerian
        //    NINs are 11 digits, which Moneta rejects, so fall back to the
        //    documented sandbox value unless we have a genuine 10-digit one.
        const accountName = (firstName || surname).replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'User'
        const rawBvn = String(p?.bvn ?? '').replace(/\D/g, '')
        const bvn = /^\d{11}$/.test(rawBvn) ? rawBvn : '00000000000'
        const rawNin = (String(p?.nin ?? '') || (p?.id_type === 'National ID (NIN)' ? String(p?.id_number ?? '') : '')).replace(/\D/g, '')
        const nin = /^\d{10}$/.test(rawNin) ? rawNin : '0000000000'

        const va = await createVirtualAccount({
          accountName,
          surname,
          firstName,
          bvn,
          nin,
        })

        // Persist via the SECURITY DEFINER RPC — the va_* columns are
        // UPDATE-revoked from clients (funding-security-patch.sql), so a direct
        // .update() fails once that revoke is applied and the VA would silently
        // never persist (re-provisioning a duplicate every launch). The RPC is a
        // one-time write that only fills the caller's own empty va_reference.
        const { error: rpcErr } = await supabase.rpc('set_virtual_account', {
          p_ref:  va.reference,
          p_num:  va.number,
          p_bank: va.bank,
          p_name: va.accountName,
        })
        if (rpcErr) throw new Error(rpcErr.message)

        set({
          vaReference:   va.reference,
          vaNumber:      va.number,
          vaBank:        va.bank,
          vaAccountName: va.accountName,
        })
      } finally {
        _ensureWalletInFlight = null
      }
    })()
    return _ensureWalletInFlight
  },

  refreshWalletBalance: async () => {
    // The wallet is a live MIRROR of the user's PAC account cash balance — the
    // single source of truth. Funding a VA posts a DEPOSIT into the user's own
    // PAC account (server reconciler); buys/sells move that PAC cash. We simply
    // read it back. The actual VA cash is invisible to the user.
    const { user, pacAccountId } = get()
    if (!user) return
    if (!pacAccountId) { set({ walletBalance: 0 }); return }
    try {
      const acct = await getAccountById(pacAccountId)
      const bal = Number(acct.balance)
      // On a network blip keep the last-known value rather than flashing ₦0.
      if (Number.isFinite(bal)) set({ walletBalance: bal })
    } catch (e) {
      console.warn('[wallet] PAC balance refresh failed:', (e as Error).message)
    }
  },

  refreshVaAvailable: async () => {
    // va_available = money in the Virtual Account available to move into the
    // trading wallet. The server reconciler credits it on new VA deposits.
    const { user } = get()
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('va_available')
      .eq('id', user.id)
      .single()
    if (data) set({ vaAvailable: Number(data.va_available ?? 0) })
  },

  fundWalletFromVa: async (amountNaira) => {
    // Server reserves from va_available, fires the cash_transactions DEPOSIT to
    // PAC, and writes the ledger. On success reflect the new VA balance and
    // re-pull the live PAC wallet balance (which just went up).
    const { vaAvailable } = await fundWalletFromVaApi(amountNaira)
    set({ vaAvailable })
    await get().refreshWalletBalance()
  },
}))
