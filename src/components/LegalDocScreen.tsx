import { View, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Text, Icon } from '@/ui'
import { colors, spacing, radii } from '@/theme'
import type { LegalDoc, LegalBlock } from '@/lib/legalContent'

// Renders a structured legal document (Privacy Policy / Terms of Service)
// natively, in-app — headings, paragraphs, bullet lists, and key/value +
// two-column tables. Content lives in src/lib/legalContent.ts.
export function LegalDocScreen({ doc }: { doc: LegalDoc }) {
  const router = useRouter()

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={{ width: 40, height: 40, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSubtle }}
          >
            <Icon name="solar:arrow-left-linear" size={20} color={colors.text} />
          </Pressable>
          <Text variant="h2">{doc.title}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing['3xl'] }} showsVerticalScrollIndicator={false}>
        <Text variant="small" tone="subtle">
          Operated by Moneta Capital Investment Limited, a subsidiary of Moneta Technology.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm }}>
          <Text variant="small" tone="muted"><Text variant="smallStrong">Effective:</Text> {doc.effective}</Text>
          <Text variant="small" tone="muted"><Text variant="smallStrong">Last updated:</Text> {doc.updated}</Text>
        </View>

        {/* Intro */}
        <View style={{ marginTop: spacing.lg, padding: spacing.lg, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgMuted }}>
          <Text variant="small" tone="muted" style={{ lineHeight: 21 }}>{doc.intro}</Text>
        </View>

        {doc.sections.map(section => (
          <View key={section.n} style={{ marginTop: spacing['2xl'] }}>
            <Text variant="h3" style={{ marginBottom: spacing.md }}>
              <Text variant="h3" tone="subtle">{section.n}. </Text>{section.title}
            </Text>
            <View style={{ gap: spacing.md }}>
              {section.blocks.map((block, i) => (
                <Block key={i} block={block} />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}

function Block({ block }: { block: LegalBlock }) {
  switch (block.type) {
    case 'p':
      return <Text variant="small" tone="muted" style={{ lineHeight: 21 }}>{block.text}</Text>

    case 'bullets':
      return (
        <View style={{ gap: spacing.sm }}>
          {block.items.map((it, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand, marginTop: 7 }} />
              <Text variant="small" tone="muted" style={{ flex: 1, lineHeight: 21 }}>{it}</Text>
            </View>
          ))}
        </View>
      )

    case 'kv':
      return (
        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, overflow: 'hidden' }}>
          {block.rows.map(([k, v], i) => (
            <View
              key={i}
              style={{ flexDirection: 'row', borderBottomWidth: i < block.rows.length - 1 ? 1 : 0, borderBottomColor: colors.border }}
            >
              <View style={{ width: '42%', backgroundColor: colors.bgMuted, paddingHorizontal: spacing.md, paddingVertical: spacing.md }}>
                <Text variant="smallStrong">{k}</Text>
              </View>
              <View style={{ flex: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md }}>
                <Text variant="small" tone="muted">{v}</Text>
              </View>
            </View>
          ))}
        </View>
      )

    case 'table':
      return (
        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', backgroundColor: colors.bgMuted, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flex: 1.1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
              <Text variant="smallStrong">{block.head[0]}</Text>
            </View>
            <View style={{ flex: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
              <Text variant="smallStrong">{block.head[1]}</Text>
            </View>
          </View>
          {block.rows.map(([a, b], i) => (
            <View
              key={i}
              style={{ flexDirection: 'row', borderBottomWidth: i < block.rows.length - 1 ? 1 : 0, borderBottomColor: colors.border, alignItems: 'flex-start' }}
            >
              <View style={{ flex: 1.1, paddingHorizontal: spacing.md, paddingVertical: spacing.md }}>
                <Text variant="small" style={{ lineHeight: 19 }}>{a}</Text>
              </View>
              <View style={{ flex: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md }}>
                <Text variant="small" tone="muted" style={{ lineHeight: 19 }}>{b}</Text>
              </View>
            </View>
          ))}
        </View>
      )
  }
}
