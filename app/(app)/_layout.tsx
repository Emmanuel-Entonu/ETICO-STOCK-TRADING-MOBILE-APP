import { Tabs } from 'expo-router'
import { FloatingTabBar } from '@/components/FloatingTabBar'

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
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
