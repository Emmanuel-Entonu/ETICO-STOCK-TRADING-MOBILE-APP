import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { User, Session } from '@supabase/supabase-js'
import {
  validateEmail, validatePassword, validateFullName, validateNairaAmount,
} from '@/lib/validation'
import { usePinStore } from '@/store/pinStore'
import { createVirtualAccount } from '@/lib/monetaApi'
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
  walletBalance: number
  hasPin: boolean
  // Moneta virtual account (wallet)
  vaReference: string | null
  vaNumber: string | null
  vaBank: string | null
  vaAccountName: string | null

  setSession: (session: Session | null) => void
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string, fullName: string) => Promise<string | null>
  signOut: () => Promise<void>
  loadProfile: () => Promise<void>
  creditWallet: (amountNaira: number) => Promise<void>
  debitWallet: (amountNaira: number) => Promise<void>
  // Lazily create the Moneta VA from the user's KYC identity, then persist it.
  ensureWallet: () => Promise<void>
  // Pull the live balance from Moneta and reflect it in walletBalance.
  refreshWalletBalance: () => Promise<void>
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
  walletBalance: 0,
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

  signUp: async (email, password, fullName) => {
    const em = validateEmail(email)
    if (!em.ok) return em.error
    const pw = validatePassword(password)
    if (!pw.ok) return pw.error
    const name = validateFullName(fullName)
    if (!name.ok) return name.error
    const { error } = await supabase.auth.signUp({
      email: em.value,
      password: pw.value,
      options: { data: { full_name: name.value } },
    })
    return error?.message ?? null
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
      cacsDocUrl: null, cacsRejectionReason: null,
      walletBalance: 0, profileReady: false, hasPin: false,
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
      .select('pac_account_id, kyc_status, wallet_balance, cacs_status, cacs_doc_url, cacs_rejection_reason, email, has_pin, va_reference, va_number, va_bank, va_account_name')
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
        walletBalance: profile.wallet_balance ?? 0,
        hasPin: !!profile.has_pin,
        vaReference: profile.va_reference ?? null,
        vaNumber: profile.va_number ?? null,
        vaBank: profile.va_bank ?? null,
        vaAccountName: profile.va_account_name ?? null,
      })
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

  creditWallet: async (amountNaira) => {
    const { user } = get()
    if (!user) throw new Error('Not authenticated')
    // Round to kobo first — PAC totals carry many decimals which would fail the
    // 2-decimal check. Trades can be tiny, so no ₦100 funding minimum here.
    const amt = validateNairaAmount(Math.round(amountNaira * 100) / 100, { min: 0.01 })
    if (!amt.ok) throw new Error(amt.error)
    // New RPC signature: no user_id parameter — auth.uid() enforced server-side.
    const { data, error } = await supabase.rpc('increment_wallet', { delta: amt.value })
    if (error) throw new Error(error.message)
    set({ walletBalance: data as number })
  },

  debitWallet: async (amountNaira) => {
    const { user } = get()
    if (!user) throw new Error('Not authenticated')
    // Round to kobo first — PAC totals carry many decimals which would fail the
    // 2-decimal check. Trades can be tiny, so no ₦100 funding minimum here.
    const amt = validateNairaAmount(Math.round(amountNaira * 100) / 100, { min: 0.01 })
    if (!amt.ok) throw new Error(amt.error)
    const { data, error } = await supabase.rpc('decrement_wallet', { delta: amt.value })
    if (error) throw new Error(error.message)
    if (data === null) throw new Error('Insufficient wallet balance')
    set({ walletBalance: data as number })
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
    // The wallet is the app-tracked ledger (profiles.wallet_balance): the
    // reconciler credits deposits into it, and every trade debits/credits it.
    // The user spends against this; the VA cash settles PAC behind the scenes.
    const { user } = get()
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('wallet_balance')
      .eq('id', user.id)
      .single()
    if (data) set({ walletBalance: data.wallet_balance ?? 0 })
  },
}))
