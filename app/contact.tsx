import { View, ScrollView, Pressable, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Text, Row, Icon, Button, toast } from '@/ui'
import { colors, spacing, radii } from '@/theme'

const SUPPORT_EMAIL = 'support@etico.ng' // placeholder inbox

export default function ContactScreen() {
  const router = useRouter()
  const sendEmail = () =>
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('ETICO support request')}`)
      .catch(() => toast.info('Email us', `Reach us at ${SUPPORT_EMAIL}`))

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Row align="center" style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={iconBtn()}>
          <Icon name="solar:alt-arrow-left-linear" size={20} color={colors.text} />
        </Pressable>
      </Row>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing['3xl'], alignItems: 'center' }} showsVerticalScrollIndicator={false}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accentSubtle, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg }}>
          <Icon name="solar:letter-bold" size={34} color={colors.accent} />
        </View>

        <Text variant="h1" align="center" style={{ marginTop: spacing.xl }}>Email support</Text>
        <Text variant="body" tone="muted" align="center" style={{ marginTop: spacing.sm, maxWidth: 340 }}>
          We do not have live chat just yet. The quickest way to reach us is by email, and we read every message.
        </Text>

        <View style={[card(), { marginTop: spacing['2xl'], width: '100%' }]}>
          <Text variant="eyebrow" tone="muted" align="center">OUR SUPPORT EMAIL</Text>
          <Text variant="h3" align="center" style={{ marginTop: spacing.xs, color: colors.brand }}>{SUPPORT_EMAIL}</Text>
        </View>

        <View style={[card(), { marginTop: spacing.lg, width: '100%' }]}>
          <Text variant="bodyStrong" align="center" style={{ marginBottom: spacing.md }}>What to include</Text>
          <Bullet text="Your full name and the email on your account" />
          <Bullet text="A clear description of the issue" />
          <Bullet text="If it is about a trade, the order number from your receipt" />
        </View>

        <Text variant="small" tone="subtle" align="center" style={{ marginTop: spacing.lg, maxWidth: 320 }}>
          We aim to reply within 24 hours on business days.
        </Text>

        <Button title="Send an email" onPress={sendEmail} style={{ marginTop: spacing['2xl'], alignSelf: 'stretch' }} />
      </ScrollView>
    </SafeAreaView>
  )
}

function Bullet({ text }: { text: string }) {
  return (
    <Row gap="sm" align="flex-start" style={{ marginBottom: spacing.sm }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, marginTop: 7 }} />
      <Text variant="small" tone="muted" style={{ flex: 1, lineHeight: 20 }}>{text}</Text>
    </Row>
  )
}

const iconBtn = () => ({
  width: 40, height: 40, borderRadius: radii.pill,
  alignItems: 'center' as const, justifyContent: 'center' as const,
  backgroundColor: colors.bgSubtle,
})
const card = () => ({
  borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
  backgroundColor: colors.surface, padding: spacing.xl,
})
