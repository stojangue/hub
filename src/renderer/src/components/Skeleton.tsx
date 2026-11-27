import { cn } from '@renderer/lib/cn'

/** A pulsing placeholder for content that is still loading. Size it with `className`. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-border/70', className)} />
}
