import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'
import { config } from './config'
import { naira } from './format'

// How notifications behave when one arrives while the app is foregrounded.
// SDK 53+ split the old `shouldShowAlert` into `shouldShowBanner` +
// `shouldShowList`; set both so foreground trade/account alerts actually
// surface as a banner (and land in the notification list) on iOS/Android.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

const CHANNEL_ID = 'trades'

let setupDone = false

/**
 * One-time setup: Android channel + permission request. Safe to call on every
 * app start. Local notifications (trade confirmations) work after this with no
 * server. Remote push (account + money events from the server) additionally
 * needs registerPushTokenAsync after sign-in.
 */
export async function setupNotifications(): Promise<boolean> {
  if (setupDone) return true
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Trade & account alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 100, 200],
        lightColor: '#DAA92F',
      })
    }
    const { status } = await Notifications.getPermissionsAsync()
    let granted = status === 'granted'
    if (!granted) {
      const req = await Notifications.requestPermissionsAsync()
      granted = req.status === 'granted'
    }
    setupDone = true
    return granted
  } catch (e) {
    console.warn('[push] setup failed:', (e as Error).message)
    return false
  }
}

/** Fire a local notification immediately — shows in the tray/lock screen even
 *  once the user leaves the app. Used for buy/sell confirmations. */
export async function notifyTrade(opts: {
  side: 'BUY' | 'SELL'
  symbol: string
  qty: number
  total: number
  orderId?: string | null
}): Promise<void> {
  try {
    const verb = opts.side === 'BUY' ? 'Buy' : 'Sell'
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${verb} order placed: ${opts.symbol}`,
        body: `${opts.qty.toLocaleString()} ${opts.symbol} for ${naira(opts.total)}. We'll let you know when it fills.`,
        data: opts.orderId ? { route: `/receipt/${opts.orderId}` } : { route: '/notifications' },
      },
      trigger: null, // immediate
    })
  } catch (e) {
    console.warn('[push] notifyTrade failed:', (e as Error).message)
  }
}

/**
 * Weekday 09:00 "the NGX is open" reminder (local time; NGX trades 09:00–14:30
 * WAT). Idempotent: cancels every earlier market reminder first.
 *
 * BUG FIXED: triggers used to be `{ weekday, hour, minute, repeats, channelId }`
 * with no `type`. expo-notifications 57 only recognises a scheduled trigger by
 * its `type`, so that object fell through to an IMMEDIATE notification — every
 * launch fired all 10 market reminders at once (the "11 notifications as soon
 * as I open the app"). Now: explicit WEEKLY triggers, and only the open reminder
 * (the close reminder was noise).
 */
export async function scheduleMarketReminders(): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync()
    for (const n of all) {
      const kind = (n.content?.data as { kind?: string } | undefined)?.kind
      const title = n.content?.title ?? ''
      if (kind === 'market-open' || kind === 'market-close' ||
          title === 'The NGX is open' || title === 'The NGX has closed') {
        await Notifications.cancelScheduledNotificationAsync(n.identifier)
      }
    }
    // expo weekday: 1=Sunday … 7=Saturday → Mon–Fri = 2..6.
    for (const weekday of [2, 3, 4, 5, 6]) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'The NGX is open',
          body: 'The Nigerian Exchange is open for trading until 2:30pm.',
          data: { kind: 'market-open', route: '/(app)/market' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday, hour: 9, minute: 0,
          ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
        },
      })
    }
  } catch (e) {
    console.warn('[push] market reminders failed:', (e as Error).message)
  }
}

// Back-compat alias — older callers imported the open-only name.
export const scheduleMarketOpenReminders = scheduleMarketReminders

/** One-time welcome push, the first time notifications are set up. */
export async function maybeNotifyWelcome(): Promise<void> {
  try {
    if (await AsyncStorage.getItem('notif:welcome')) return
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Welcome to ETICO',
        body: 'Ethical investing on the Nigerian Exchange. Verify your identity to start trading.',
        data: { route: '/(app)' },
      },
      trigger: null,
    })
    await AsyncStorage.setItem('notif:welcome', '1')
  } catch (e) {
    console.warn('[push] welcome failed:', (e as Error).message)
  }
}

/** Fired when a previously-pending order is detected as filled. */
export async function notifyOrderFilled(opts: {
  side: 'BUY' | 'SELL'; symbol: string; qty: number; total: number; orderId?: string | null
}): Promise<void> {
  try {
    const verb = opts.side === 'BUY' ? 'bought' : 'sold'
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Order filled: ${opts.symbol}`,
        body: `You ${verb} ${opts.qty.toLocaleString()} ${opts.symbol} for ${naira(opts.total)}.`,
        data: opts.orderId ? { route: `/receipt/${opts.orderId}` } : { route: '/notifications' },
      },
      trigger: null,
    })
  } catch (e) {
    console.warn('[push] notifyOrderFilled failed:', (e as Error).message)
  }
}

/**
 * KYC push reminders, kept in step with the account's KYC state (call on every
 * profile load):
 *  • not started / skipped → one series of reminders at +1, +3 and +7 days
 *    (a new series at most every 14 days, so it never nags daily).
 *  • rejected → a "redo your KYC" reminder 2 days out. The rejection itself is
 *    pushed by the server the moment the reviewer decides, so no copy here.
 *  • submitted / approved → all KYC reminders cancelled.
 */
const KYC_KINDS = ['kyc-reminder', 'kyc-redo']
export async function syncKycReminders(userId: string, kycStatus: string | null | undefined, cacsStatus: string | null | undefined): Promise<void> {
  try {
    const notStarted = !kycStatus || kycStatus === 'pending' || kycStatus === 'skipped'
    const rejected = cacsStatus === 'rejected' || kycStatus === 'rejected'
    const want = rejected ? 'kyc-redo' : notStarted ? 'kyc-reminder' : null

    const scheduled = await Notifications.getAllScheduledNotificationsAsync()
    const ours = scheduled.filter((n) => KYC_KINDS.includes((n.content?.data as { kind?: string } | undefined)?.kind ?? ''))
    // Drop reminders that no longer fit the current state.
    for (const n of ours) {
      if ((n.content?.data as { kind?: string }).kind !== want) await Notifications.cancelScheduledNotificationAsync(n.identifier)
    }
    if (!want || ours.some((n) => (n.content?.data as { kind?: string }).kind === want)) return

    const key = `notif:${want}:${userId}`
    const last = Number(await AsyncStorage.getItem(key)) || 0
    const DAY = 86_400
    if (Date.now() - last < (want === 'kyc-redo' ? 3 : 14) * DAY * 1000) return

    const channel = Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}
    const series = want === 'kyc-redo'
      ? [{ at: 2 * DAY, title: 'Finish your verification', body: 'Your account couldn’t be verified yet. Fix the highlighted details and resubmit — it only takes a few minutes.' }]
      : [
          { at: 1 * DAY, title: 'Verify your identity to start investing', body: 'It takes about 5 minutes with your BVN. You’ll be able to invest once your account is approved.' },
          { at: 3 * DAY, title: 'Your ETICO account is almost ready', body: 'Complete your KYC to open your trading account and start building your portfolio.' },
          { at: 7 * DAY, title: 'Still want to invest ethically?', body: 'Finish verifying your identity — we’ll take it from there.' },
        ]
    for (const s of series) {
      await Notifications.scheduleNotificationAsync({
        content: { title: s.title, body: s.body, data: { kind: want, route: '/(auth)/kyc' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: s.at, repeats: false, ...channel },
      })
    }
    await AsyncStorage.setItem(key, String(Date.now()))
  } catch (e) {
    console.warn('[push] kyc reminders failed:', (e as Error).message)
  }
}

/** Sign-out: this device shouldn't remind the next person about someone else's KYC. */
export async function cancelKycReminders(): Promise<void> {
  try {
    for (const n of await Notifications.getAllScheduledNotificationsAsync()) {
      if (KYC_KINDS.includes((n.content?.data as { kind?: string } | undefined)?.kind ?? '')) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier)
      }
    }
  } catch { /* ignore */ }
}

// CSCS approved / rejected, deposit received and wallet funded are sent by the
// SERVER (public.notifications + Expo push to every device on the account), so
// the app no longer raises its own copies — that would double-notify.

/**
 * Register THIS device for remote push. Stored server-side in push_tokens (one
 * row per device) via the register_push_token RPC, so account events reach every
 * device the user is signed in on. Call after sign-in; safe to call repeatedly.
 */
const TOKEN_KEY = 'push:token'
export async function registerPushTokenAsync(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return
    const perm = await Notifications.getPermissionsAsync()
    if (perm.status !== 'granted') return
    const tokenRes = await Notifications.getExpoPushTokenAsync(
      config.easProjectId ? { projectId: config.easProjectId } : undefined,
    )
    const token = tokenRes.data
    if (!token) return
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS })
    if (error) throw error
    await AsyncStorage.setItem(TOKEN_KEY, token)
  } catch (e) {
    console.warn('[push] token registration failed:', (e as Error).message)
  }
}

/** Sign-out: stop this device receiving the account's pushes. Call BEFORE the
 *  session is cleared (the RPC needs the user's JWT). */
export async function unregisterPushTokenAsync(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY)
    if (!token) return
    await supabase.rpc('unregister_push_token', { p_token: token })
    await AsyncStorage.removeItem(TOKEN_KEY)
  } catch (e) {
    console.warn('[push] token unregister failed:', (e as Error).message)
  }
}
