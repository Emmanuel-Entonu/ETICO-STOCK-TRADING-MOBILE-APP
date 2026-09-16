import { View, ScrollView, Pressable, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Text, Card, Row, Icon, Divider, toast } from '@/ui'
import { colors, spacing, radii } from '@/theme'
import { config } from '@/lib/config'

// Legal & policies hub. Google Play requires a privacy policy that's reachable
// from within the app (and linked in the store listing). These open the hosted
// pages on the ETICO site; keep those URLs live.
const LINKS = [
  { icon: 'solar:shield-check-bold', label: 'Privacy Policy',   url: `${config.siteBase}/privacy` },
  { icon: 'solar:document-text-bold', label: 'Terms of Service', url: `${config.siteBase}/terms` },
  { icon: 'solar:info-circle-bold',  label: 'Risk Disclosure',  url: `${config.siteBase}/risk-disclosure` },
]

export default function LegalScreen() {
  const router = useRouter()

  const open = async (url: string) => {
    try {
      const ok = await Linking.canOpenURL(url)
      if (!ok) { toast.warn('Could not open link', 'Please visit etico.ng from your browser.'); return }
      await Linking.openURL(url)
    } catch {
      toast.warn('Could not open link', 'Please visit etico.ng from your browser.')
    }
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm }}>
        <Row gap="md" align="center">
          <Pressable onPress={() => router.back()} hitSlop={12} style={{ width: 40, height: 40, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSubtle }}>
            <Icon name="solar:arrow-left-linear" size={20} color={colors.text} />
          </Pressable>
          <Text variant="h2">Legal & policies</Text>
        </Row>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing['3xl'] }}>
        <Card padded={false}>
          {LINKS.map((l, i) => (
            <View key={l.label}>
              <Pressable
                onPress={() => open(l.url)}
                style={({ pressed }) => ({ paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: pressed ? colors.bgMuted : 'transparent' })}
              >
                <Row justify="space-between" align="center">
                  <Row gap="md" align="center" style={{ flex: 1 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.bgSubtle, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={l.icon} size={18} color={colors.textMuted} />
                    </View>
                    <Text variant="body">{l.label}</Text>
                  </Row>
                  <Icon name="solar:arrow-right-linear" size={18} color={colors.textSubtle} />
                </Row>
              </Pressable>
              {i < LINKS.length - 1 && <Divider my="xs" />}
            </View>
          ))}
        </Card>

        <Text variant="small" tone="muted" style={{ marginTop: spacing.xl, lineHeight: 20 }}>
          ETICO is operated by Moneta Capital Investment Limited. Securities services
          are provided through PAC (MyWealthCare) and are subject to the rules of the
          Securities and Exchange Commission of Nigeria (SEC) and the Nigerian
          Exchange (NGX). Investing carries risk, including possible loss of capital.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}
