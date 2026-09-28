import { Tabs } from 'expo-router'
import { FloatingTabBar } from '@/components/FloatingTabBar'
import { colors } from '@/theme'

export default function AppLayout() {
  return (
    <Tabs
      // No tab animation: switching tabs is instant (the cross-fade showed the
      // navigator background between screens and felt slow). Tabs stay mounted
      // after first visit, so coming back is immediate too.
      // freezeOnBlur: inactive tabs stop re-rendering on store updates (wallet
      // refreshes, market polls) so the visible screen keeps the frame budget.
      screenOptions={{ headerShown: false, animation: 'none', freezeOnBlur: true, sceneStyle: { backgroundColor: colors.bg } }}
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
