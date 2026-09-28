// @@iconify-code-gen
import { useEffect, useRef, useState } from 'react'
import { Stack, useRouter, useSegments, ThemeProvider, DarkTheme, DefaultTheme } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AppState, Appearance, View } from 'react-native'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { usePinStore } from '@/store/pinStore'
import { usePortfolioStore } from '@/store/portfolioStore'
import { useNotificationStore } from '@/store/notificationStore'
import { useThemeStore, resolvePalette, resolveScheme, setActivePalette, colors } from '@/theme'
import { ToastHost, Loader } from '@/ui'
import { BrandSplash } from '@/components/BrandSplash'
import { AppErrorBoundary } from '@/components/AppErrorBoundary'
import * as Notifications from 'expo-notifications'
import { setupNotifications, registerPushTokenAsync, scheduleMarketReminders, maybeNotifyWelcome } from '@/lib/pushNotifications'
import { useShallow } from 'zustand/react/shallow'

const LOGIN_ROUTES = new Set(['welcome', 'login', 'register', 'reset'])

function AuthGate() {
  const router = useRouter()
  const segments = useSegments()
  const { user, loading, profileReady, kycStatus, hasPin } = useAuthStore(useShallow((s) => ({ user: s.user, loading: s.loading, profileReady: s.profileReady, kycStatus: s.kycStatus, hasPin: s.hasPin })))
  const unlockedThisSession = usePinStore(s => s.unlockedThisSession)

  useEffect(() => {
    if (loading) return

    const inAuthGroup = segments[0] === '(auth)'
    const leaf        = segments[segments.length - 1] ?? ''
    const inLogin     = inAuthGroup && LOGIN_ROUTES.has(leaf)
    const inKycRoute  = segments.some(s => s === 'kyc')
    const inPinRoute  = segments.some(s => s === 'pin')

    // Password reset is reachable from anywhere (incl. the in-app Support page),
    // so don't bounce a signed-in user away from it.
    if (leaf === 'reset') return

    // 1. Not signed in → welcome (unless already on welcome/login/register/reset).
    if (!user) {
      if (!inLogin) router.replace('/(auth)/welcome' as never)
      return
    }

    // Wait for profile to load before making further routing decisions.
    if (!profileReady) return

    // 2. No PIN yet → create one.
    if (!hasPin) {
      if (!inPinRoute) router.replace('/(auth)/pin?mode=create')
      return
    }

    // 3. Session not unlocked → enter PIN.
    if (!unlockedThisSession) {
      if (!inPinRoute) router.replace('/(auth)/pin?mode=enter')
      return
    }

    // 4. KYC still pending → verify.
    const needsKyc = !kycStatus || kycStatus === 'pending'
    if (needsKyc) {
      if (!inKycRoute) router.replace('/(auth)/kyc')
      return
    }

    // 5. Nothing gating them; bounce out of the auth group if we're still there
    //    — EXCEPT the KYC route, which a verified user can re-enter on purpose to
    //    redo KYC after a CSCS rejection. Bouncing it made "Redo KYC" a no-op.
    if (inAuthGroup && !inKycRoute) router.replace('/(app)')
  }, [user, loading, profileReady, kycStatus, hasPin, unlockedThisSession, segments])

  return null
}

// Full-screen splash that covers whatever route happens to be mounted while
// the AuthGate is deciding where to send the user. Prevents the tabs from
// flashing behind a pending PIN prompt on cold-start or resume-from-background.
function TransitionSplash() {
  const { user, loading, profileReady, hasPin } = useAuthStore(useShallow((s) => ({ user: s.user, loading: s.loading, profileReady: s.profileReady, hasPin: s.hasPin })))
  const unlockedThisSession = usePinStore(s => s.unlockedThisSession)
  const segments = useSegments()

  const inPinRoute = segments.some(s => s === 'pin')

  const show =
    loading ||
    (user && !profileReady) ||
    (user && hasPin && !unlockedThisSession && !inPinRoute)

  if (!show) return null
  return (
    <View
      pointerEvents="auto"
      style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        elevation: 1000,
      }}
    >
      {/* Loader is a pulsing ETICO mark — no wordmark needed on splash. */}
      <Loader size={80} />
    </View>
  )
}

// Opaque branded cover shown the instant the app stops being `active`
// (minimized, app-switcher, or a system dialog on top). Blocks the app
// content from any glance or the task-switcher snapshot on both platforms —
// a JS complement to Android's FLAG_SECURE + native overlay. This is purely
// visual: it does NOT lock the session or touch navigation, so returning to
// the app reveals exactly the screen the user left.
function PrivacyOverlay() {
  const [hidden, setHidden] = useState(AppState.currentState !== 'active')

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setHidden(state !== 'active')
    })
    return () => sub.remove()
  }, [])

  if (!hidden) return null
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        elevation: 2000,
      }}
    >
      <Loader size={80} />
    </View>
  )
}

// Latest segments snapshot readable from non-React contexts (e.g. the
// AppState listener that fires during background events).
const segmentsRef = { current: [] as string[] }

export default function RootLayout() {
  const router = useRouter()
  const segments = useSegments()
  segmentsRef.current = segments
  const setSession = useAuthStore((s) => s.setSession)
  const lastForegroundRefresh = useRef(0)
  const mode = useThemeStore((s) => s.mode)

  // Sync the active palette BEFORE this render commits, so every child
  // read from the `colors` proxy sees the right values.
  setActivePalette(resolvePalette(mode))
  const scheme = resolveScheme(mode)
  // Navigation paints its own background behind every screen during a
  // transition. Without a theme it's React Navigation's default light grey —
  // the white flash when switching pages (worst in dark mode). Use ours.
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme
  const navTheme = {
    ...base,
    colors: { ...base.colors, background: colors.bg, card: colors.bg, text: colors.text, border: colors.border, primary: colors.brand },
  }

  // Theme now follows the phone exclusively (no in-app theme picker). Reset any
  // previously-persisted light/dark choice back to 'system' on boot.
  useEffect(() => {
    const t = useThemeStore.getState()
    if (t.mode !== 'system') t.setMode('system')
  }, [])

  // Push/local notifications: set up channel + permission, try to register a
  // push token for later server pushes, and route when a notification is tapped.
  useEffect(() => {
    setupNotifications().then((granted) => {
      if (granted) { registerPushTokenAsync(); scheduleMarketReminders(); maybeNotifyWelcome() }
    })
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const route = (res.notification.request.content.data as { route?: string })?.route
      if (route) router.push(route as never)
    })
    // A server push arrived while the app is open → pull it into the list now.
    const recv = Notifications.addNotificationReceivedListener(() => {
      useNotificationStore.getState().refreshServer(true)
    })
    return () => { sub.remove(); recv.remove() }
  }, [router])

  // Register this device for server push whenever someone signs in (the
  // launch-time call runs before login, so it used to register nothing).
  const userId = useAuthStore((s) => s.user?.id ?? null)
  useEffect(() => {
    if (!userId) return
    registerPushTokenAsync()
    useNotificationStore.getState().refreshServer(true)
  }, [userId])

  // CSCS approved/rejected, deposits and wallet funding are pushed by the
  // server to every signed-in device (see public.notifications) — no local copy.

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [setSession])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const pin = usePinStore.getState()
      if (state === 'active') {
        pin.handleForeground()
        const s = useAuthStore.getState()
        // Throttle: re-fetch at most every 30s on foreground. Rapid app
        // switching was firing a profile + orders + PAC round-trip each time.
        const now = Date.now()
        if (now - lastForegroundRefresh.current < 30_000) return
        lastForegroundRefresh.current = now
        if (s.user) s.loadProfile()
        // Refresh orders on foreground and sync notifications, so any fill that
        // happened while the app was away is detected and notified.
        if (s.user && s.pacAccountId) {
          const port = usePortfolioStore.getState()
          port.loadOrders(s.pacAccountId).then(() => {
            const a = useAuthStore.getState()
            useNotificationStore.getState().sync(usePortfolioStore.getState().pacOrders, { kycStatus: a.kycStatus, cacsStatus: a.cacsStatus, cacsRejectionReason: a.cacsRejectionReason })
          }).catch(() => {})
        }
      } else if (state === 'background') {
        // Only 'background' — NOT 'inactive'. iOS fires 'inactive' during
        // system dialogs (Face ID, share sheet, keyboard dictation, incoming
        // calls) and Android emits it during rapid app-switch flickers.
        //
        // We only RECORD the time here (handleBackground). We deliberately do
        // NOT lock the session or navigate to the PIN screen on background:
        // doing so replaced the navigation stack, so a quick minimize dumped
        // the user back on Home (losing the trade sheet / wallet / etc. they
        // were on) and left the trade modal with nothing behind it — pressing
        // back then closed the whole app. The screen is already blocked while
        // away by FLAG_SECURE + the native privacy overlay and the JS
        // <PrivacyOverlay/> below. The PIN is re-required on resume only if the
        // grace window elapsed — handleForeground locks then, and AuthGate
        // routes to the PIN screen.
        pin.handleBackground()
      }
    })
    return () => sub.remove()
  }, [router])

  // React to system-appearance changes when the user is on 'system'.
  useEffect(() => {
    const sub = Appearance.addChangeListener(() => {
      const currentMode = useThemeStore.getState().mode
      if (currentMode === 'system') {
        setActivePalette(resolvePalette('system'))
        // Force a re-render by touching a piece of state that root reads.
        useThemeStore.setState({ mode: 'system' })
      }
    })
    return () => sub.remove()
  }, [])

  return (
    // useThemedStyles in each component re-computes its StyleSheet.create on
    // scheme change, so a full-tree remount is no longer necessary.
    <SafeAreaProvider style={{ backgroundColor: colors.bg }}>
      <ThemeProvider value={navTheme}>
      <AuthGate />
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <AppErrorBoundary>
        {/* freezeOnBlur: screens underneath the active one stop re-rendering. */}
        <Stack screenOptions={{ headerShown: false, animation: 'fade', animationDuration: 180, freezeOnBlur: true, contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
          <Stack.Screen name="trade/[symbol]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="receipt/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="orders" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="wallet" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="fund-wallet" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="watchlist" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="legal" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="privacy" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="terms" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="delete-account" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="contact" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="order-status/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="allocation" options={{ presentation: 'modal', animation: 'slide_from_bottom', animationDuration: 320 }} />
        </Stack>
      </AppErrorBoundary>
      <TransitionSplash />
      <PrivacyOverlay />
      <BrandSplash />
      <ToastHost />
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
