import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/cn'

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'merged'

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'border-border text-muted',
  accent: 'border-accent/30 bg-accent/10 text-accent',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  danger: 'border-danger/30 bg-danger/10 text-danger',
  merged: 'border-merged/30 bg-merged/10 text-merged',
}

interface BadgeProps {
  tone?: BadgeTone
  /** Optional leading icon or color dot. */
  icon?: ReactNode
  title?: string
  children: ReactNode
}

/** A small, rounded status label. */
export function Badge({ tone = 'neutral', icon, title, children }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-xs leading-none font-medium whitespace-nowrap',
        toneClasses[tone],
      )}
    >
      {icon}
      {children}
    </span>
  )
}
