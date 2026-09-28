import type { ReactNode } from 'react'
import { View, Pressable } from 'react-native'
import { Text } from './Text'
import { Icon } from './Icon'
import { Button } from './Button'
import { colors, spacing, radii } from '@/theme'

// Notice — the one in-page message card (info / success / warning / error).
//
// Replaces the ad-hoc tinted cards scattered across screens. Structure follows
// common alert-banner guidance: a severity icon, a title that says what
// happened, a short body saying what it means / what to do, and at most one
// primary action. Neutral surface + a tinted icon tile — readable in both themes and calmer than a fully tinted box.
// Tone is never carried by colour alone (icon + title wording carry it too).
//
// Keep only ONE notice per screen section where possible.

export type NoticeTone = 'info' | 'success' | 'warning' | 'error'

const TONES: Record<NoticeTone, { icon: string; fg: () => string; bg: () => string }> = {
  info:    { icon: 'solar:info-circle-bold',     fg: () => colors.brand,    bg: () => colors.brandSubtle },
  success: { icon: 'solar:check-circle-bold',    fg: () => colors.positive, bg: () => colors.positiveSubtle },
  warning: { icon: 'solar:danger-triangle-bold', fg: () => colors.warning,  bg: () => colors.warningSubtle },
  error:   { icon: 'solar:shield-warning-bold',  fg: () => colors.negative, bg: () => colors.negativeSubtle },
}

export function Notice({
  tone = 'info', title, body, icon, action, onPress, children, style,
}: {
  tone?: NoticeTone
  title: string
  body?: string
  /** Override the tone's default icon. */
  icon?: string
  /** One primary action, rendered as a full-width button. */
  action?: { label: string; onPress: () => void }
  /** Makes the whole card tappable (shows a chevron) — use instead of `action`. */
  onPress?: () => void
  children?: ReactNode
  style?: object
}) {
  const t = TONES[tone]
  const fg = t.fg()
  const content = (
    <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
      <View style={{ width: 36, height: 36, borderRadius: radii.md, backgroundColor: t.bg(), alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon ?? t.icon} size={20} color={fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong">{title}</Text>
        {body ? <Text variant="small" tone="muted" style={{ marginTop: 3, lineHeight: 19 }}>{body}</Text> : null}
        {children ? <View style={{ marginTop: spacing.md }}>{children}</View> : null}
        {action ? (
          <View style={{ marginTop: spacing.lg }}>
            <Button title={action.label} onPress={action.onPress} />
          </View>
        ) : null}
      </View>
      {onPress && !action ? <Icon name="solar:alt-arrow-right-linear" size={18} color={colors.textMuted} /> : null}
    </View>
  )
  const card = {
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...style,
  }
  return onPress && !action ? (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [card, pressed && { opacity: 0.85 }]}>
      {content}
    </Pressable>
  ) : (
    <View accessibilityRole="summary" style={card}>{content}</View>
  )
}
