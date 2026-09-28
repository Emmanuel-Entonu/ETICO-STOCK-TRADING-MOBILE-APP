import { Easing } from 'react-native'
import { Tabs } from 'expo-router'
import { FloatingTabBar } from '@/components/FloatingTabBar'
import { colors } from '@/theme'

export default function AppLayout() {
  return (
    <Tabs
      // Keep every tab attached once visited. Detaching (the Android default)
      // destroyed the Home Beams GL surface on each tab switch, so coming back
      // rebuilt it from scratch (a few seconds of an empty card). Hidden tabs
      // are still frozen (freezeOnBlur) and their animations paused, so staying
      // attached costs memory, not frames.
      detachInactiveScreens={false}
      screenOptions={{
        headerShown: false,
        // A short ease-out cross-fade: smooth without feeling slow. The scene
        // background is our theme colour, so nothing white shows mid-fade.
        animation: 'fade',
        transitionSpec: { animation: 'timing', config: { duration: 200, easing: Easing.out(Easing.cubic) } },
        // freezeOnBlur: inactive tabs stop re-rendering on store updates (wallet
        // refreshes, market polls) so the visible screen keeps the frame budget.
        freezeOnBlur: true,
        sceneStyle: { backgroundColor: colors.bg },
      }}
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="invest" options={{ title: 'Invest' }} />
      <Tabs.Screen name="support" options={{ title: 'Support' }} />
      <Tabs.Screen name="account" options={{ title: 'Account' }} />
      {/* Market is reached from Invest cards / Home rows, hidden from the nav */}
      <Tabs.Screen name="market" options={{ href: null }} />
    </Tabs>
  )
}
