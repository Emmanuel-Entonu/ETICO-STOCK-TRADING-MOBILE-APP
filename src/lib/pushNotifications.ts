import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'
import { naira } from './format'

// How notifications behave when one arrives while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
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
export async function scheduleMarketOpenReminders(): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync()
    for (const n of all) {
      if ((n.content?.data as { kind?: string } | undefined)?.kind === 'market-open') {
        await Notifications.cancelScheduledNotificationAsync(n.identifier)
      }
    }
    // expo weekday: 1=Sunday … 7=Saturday, so Mon–Fri = 2..6.
    for (const weekday of [2, 3, 4, 5, 6]) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'The NGX is open',
          body: 'The Nigerian Exchange is now open for trading. Review your picks and place your orders.',
          data: { kind: 'market-open', route: '/(app)/market' },
        },
        trigger: { weekday, hour: 9, minute: 0, repeats: true, channelId: CHANNEL_ID },
      })
    }
  } catch (e) {
    console.warn('[push] market-open reminders failed:', (e as Error).message)
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

/** One-time alert when the user's CSCS/CACS account is assigned/approved. */
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

/**
 * Fire once-off account-event notifications when a status transitions. Uses
 * AsyncStorage flags so each event only notifies a single time.
 * (Wallet funding credit/debit notifications will be added once PAC funding
 * is wired — they belong here too.)
 */
export async function maybeNotifyAccountEvents(status: { kycStatus?: string | null; cacsStatus?: string | null }): Promise<void> {
  try {
    if (status.cacsStatus === 'approved') {
      const done = await AsyncStorage.getItem('notif:cscs-approved')
      if (!done) {
        await notifyCscsAssigned()
        await AsyncStorage.setItem('notif:cscs-approved', '1')
      }
    }
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
    const tokenRes = await Notifications.getExpoPushTokenAsync()
    const token = tokenRes.data
    if (!token) return
    await supabase.from('profiles').update({ push_token: token }).eq('id', user.id)
  } catch (e) {
    // Expected until FCM credentials are set up — safe to ignore for now.
    console.warn('[push] token registration skipped:', (e as Error).message)
  }
}
