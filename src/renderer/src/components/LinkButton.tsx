import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@renderer/lib/cn'

interface LinkButtonProps {
  to: string
  variant?: 'primary' | 'secondary'
  children: ReactNode
}

/** An in-app link that looks like a `Button`. */
export function LinkButton({ to, variant = 'secondary', children }: LinkButtonProps) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-3 font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent',
        variant === 'primary'
          ? 'bg-accent text-background shadow-sm hover:bg-accent/90 focus-visible:ring-offset-2 focus-visible:ring-offset-background'
          : 'border border-border bg-background shadow-sm hover:bg-surface',
      )}
    >
      {children}
    </Link>
  )
}
