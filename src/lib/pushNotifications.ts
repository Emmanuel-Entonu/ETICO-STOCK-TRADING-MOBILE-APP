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
 * server or FCM. Remote push (fills while the app is closed) additionally needs
 * FCM credentials + a backend — see registerPushTokenAsync.
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
    const verb = opts.side === 'BUY' ? 'Bought' : 'Sold'
    const amount = naira(opts.total)
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${verb} ${opts.qty.toLocaleString()} ${opts.symbol}`,
        body: `Your ${opts.side.toLowerCase()} order for ${amount} was placed successfully.`,
        data: opts.orderId ? { route: `/receipt/${opts.orderId}` } : { route: '/notifications' },
      },
      trigger: null, // immediate
    })
  } catch (e) {
    console.warn('[push] notifyTrade failed:', (e as Error).message)
  }
}

/**
 * Schedule a recurring "the NGX is open" reminder for each weekday at 09:00
 * local time. Idempotent: clears any previously-scheduled market-open
 * reminders first so we don't stack duplicates on every launch.
 */
export async function scheduleMarketReminders(): Promise<void> {
  try {
    // Clear any previously-scheduled market reminders first so we never stack
    // duplicates. Match on BOTH the `kind` tag AND the titles — older builds
    // scheduled these without the tag, so a tag-only sweep left them behind and
    // the user accumulated several identical alerts (the reported "sent ~5
    // times"). Matching the titles reclaims those too.
    const all = await Notifications.getAllScheduledNotificationsAsync()
    for (const n of all) {
      const kind = (n.content?.data as { kind?: string } | undefined)?.kind
      const title = n.content?.title ?? ''
      if (kind === 'market-open' || kind === 'market-close' ||
          title === 'The NGX is open' || title === 'The NGX has closed') {
        await Notifications.cancelScheduledNotificationAsync(n.identifier)
      }
    }
    // NGX trades weekdays 09:00–14:30 WAT. expo weekday: 1=Sunday … 7=Saturday,
    // so Mon–Fri = 2..6. One open reminder (09:00) + one close reminder (14:30)
    // per weekday, all repeating.
    for (const weekday of [2, 3, 4, 5, 6]) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'The NGX is open',
          body: 'The Nigerian Exchange is now open for trading. Review your picks and place your orders.',
          data: { kind: 'market-open', route: '/(app)/market' },
        },
        trigger: { weekday, hour: 9, minute: 0, repeats: true, channelId: CHANNEL_ID },
      })
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'The NGX has closed',
          body: 'Trading is closed for today (it reopens 09:00 WAT on the next business day). Any pending orders carry over.',
          data: { kind: 'market-close', route: '/(app)/market' },
        },
        trigger: { weekday, hour: 14, minute: 30, repeats: true, channelId: CHANNEL_ID },
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
    const verb = opts.side === 'BUY' ? 'buy' : 'sell'
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Order filled: ${opts.symbol}`,
        body: `Your ${verb} of ${opts.qty.toLocaleString()} ${opts.symbol} filled at ${naira(opts.total)}.`,
        data: opts.orderId ? { route: `/receipt/${opts.orderId}` } : { route: '/notifications' },
      },
      trigger: null,
    })
  } catch (e) {
    console.warn('[push] notifyOrderFilled failed:', (e as Error).message)
  }
}

/** Alert when the user's CSCS/CACS account is approved. */
async function notifyCscsAssigned(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Your CSCS account is ready',
      body: 'Your CSCS/CACS setup is complete. You can now trade on the NGX.',
      data: { route: '/(app)' },
    },
    trigger: null,
  })
}

// Reviewer stores rejection reasons joined by " • "; show just the first.
function firstReason(reason?: string | null): string {
  const first = (reason ?? '').split('•').map(s => s.trim()).filter(Boolean)[0]
  return first ?? ''
}

/** Alert when the user's CSCS/CACS review was rejected. */
async function notifyCscsRejected(reason?: string | null): Promise<void> {
  const r = firstReason(reason)
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'CSCS verification needs attention',
      body: r
        ? `Your CSCS review couldn't be approved: ${r}. Tap to redo your KYC.`
        : "Your CSCS review couldn't be approved. Tap to fix it and redo your KYC.",
      data: { route: '/(auth)/kyc' },
    },
    trigger: null,
  })
}

/**
 * Fire a tray notification when the CSCS review status TRANSITIONS to approved
 * or rejected — never on every foreground/login. We persist the last CSCS
 * status we reacted to; a notification only fires when the current status
 * differs from it. This naturally handles a redo (rejected → pending → rejected
 * re-notifies) without spamming.
 */
export async function maybeNotifyAccountEvents(status: {
  kycStatus?: string | null
  cacsStatus?: string | null
  cacsRejectionReason?: string | null
}): Promise<void> {
  try {
    const cacs = status.cacsStatus ?? null
    if (!cacs) return
    const KEY = 'notif:cscs-last'
    const last = await AsyncStorage.getItem(KEY)
    if (cacs === last) return                 // no change → no notification
    if (cacs === 'approved')      await notifyCscsAssigned()
    else if (cacs === 'rejected') await notifyCscsRejected(status.cacsRejectionReason)
    // Record every status (incl. pending/not_submitted) so we only fire on real
    // transitions into approved/rejected, and a later re-rejection still fires.
    await AsyncStorage.setItem(KEY, cacs)
  } catch (e) {
    console.warn('[push] account events failed:', (e as Error).message)
  }
}

/**
 * Best-effort Expo push-token registration so a backend can later push for
 * events that happen while the app is closed (order fills, T+3 settlement).
 * On Android this needs FCM configured; until then it throws and we no-op.
 * The token is stored on the user's profile for the server to use.
 */
export async function registerPushTokenAsync(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    // getExpoPushTokenAsync needs the EAS projectId. Pass it explicitly when
    // set via env; otherwise the SDK reads it from app.json extra.eas.projectId
    // (written by `eas init`). Requires google-services.json + FCM creds to
    // actually mint a token on Android.
    const tokenRes = await Notifications.getExpoPushTokenAsync(
      config.easProjectId ? { projectId: config.easProjectId } : undefined,
    )
    const token = tokenRes.data
    if (!token) return
    await supabase.from('profiles').update({ push_token: token }).eq('id', user.id)
  } catch (e) {
    // Expected until FCM credentials are set up — safe to ignore for now.
    console.warn('[push] token registration skipped:', (e as Error).message)
  }
}
