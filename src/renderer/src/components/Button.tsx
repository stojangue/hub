import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@renderer/lib/cn'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'secondary' | 'ghost'
  /** Square button for a single icon. Needs an `aria-label`. */
  iconOnly?: boolean
}

export function Button({
  variant = 'secondary',
  iconOnly = false,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50',
        iconOnly ? 'size-7' : 'h-7 px-3',
        variant === 'secondary'
          ? 'border border-border bg-background text-foreground shadow-sm hover:bg-surface'
          : 'text-muted hover:bg-border/60 hover:text-foreground',
        className,
      )}
      {...props}
    />
  )
}
