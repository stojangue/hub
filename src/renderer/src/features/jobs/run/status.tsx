import { Badge, type BadgeTone } from '@renderer/components/Badge'
import { useT } from '@renderer/i18n'
import { cn } from '@renderer/lib/cn'
import type { StatusStyle } from './status-styles'

const toneText: Record<BadgeTone, string> = {
  neutral: 'text-muted',
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  merged: 'text-merged',
}

export function StatusBadge({ style }: { style: StatusStyle }) {
  const t = useT()
  const Icon = style.icon
  return (
    <Badge
      tone={style.tone}
      icon={<Icon aria-hidden className={cn('size-3', style.spin && 'animate-spin')} />}
    >
      {t(style.labelKey)}
    </Badge>
  )
}

/** Just the colored icon, with the label as tooltip and for screen readers. */
export function StatusIcon({ style, className }: { style: StatusStyle; className?: string }) {
  const t = useT()
  const Icon = style.icon
  return (
    <Icon
      role="img"
      aria-label={t(style.labelKey)}
      className={cn(
        'size-4 shrink-0',
        toneText[style.tone],
        style.spin && 'animate-spin',
        className,
      )}
    >
      <title>{t(style.labelKey)}</title>
    </Icon>
  )
}
