import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/cn'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: ReactNode
  /** Buttons or links shown below the text. */
  action?: ReactNode
  tone?: 'neutral' | 'danger'
  className?: string
}

/** Centered message for empty lists, missing requirements and errors. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = 'neutral',
  className,
}: EmptyStateProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : undefined}
      className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}
    >
      <div
        className={cn(
          'mb-3 flex size-10 items-center justify-center rounded-full',
          tone === 'danger' ? 'bg-danger/10 text-danger' : 'bg-border/60 text-muted',
        )}
      >
        <Icon aria-hidden className="size-5" />
      </div>
      <h2 className="font-semibold">{title}</h2>
      {description && (
        <div className="mt-1 max-w-sm text-[0.8125rem] text-muted">{description}</div>
      )}
      {action && <div className="mt-4 flex items-center gap-2">{action}</div>}
    </div>
  )
}
