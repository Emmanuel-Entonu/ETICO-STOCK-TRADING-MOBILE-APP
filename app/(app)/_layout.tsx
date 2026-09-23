import { Tabs } from 'expo-router'
import { FloatingTabBar } from '@/components/FloatingTabBar'

export default function AppLayout() {
  return (
    <Tabs
      // fade: a quick cross-fade instead of a hard cut between tabs.
      // freezeOnBlur: inactive tabs stop re-rendering on store updates (wallet
      // refreshes, market polls) so the visible screen keeps the frame budget.
      screenOptions={{ headerShown: false, animation: 'fade', freezeOnBlur: true }}
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="invest" options={{ title: 'Invest' }} />
      <Tabs.Screen name="support" options={{ title: 'Support' }} />
      <Tabs.Screen name="account" options={{ title: 'Account' }} />
      {/* Market is reached from Invest cards / Home rows — hidden from the nav */}
      <Tabs.Screen name="market" options={{ href: null }} />
    </Tabs>
  )
}
