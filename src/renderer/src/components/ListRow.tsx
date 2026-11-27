import { Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { formatDate, formatDateTime } from '@renderer/lib/relative-time'
import { useSettings } from '@renderer/settings/context'
import { Button } from './Button'
import { Skeleton } from './Skeleton'

interface ListRowProps {
  /** Where a click on the row leads. */
  to: string
  icon: ReactNode
  name: string
  /** Extra details next to the name, e.g. what the item is based on. */
  meta?: ReactNode
  createdAt: string
  /** Accessible name of the delete button, e.g. "Delete blueprint Release". */
  deleteLabel: string
  onDelete: () => void
}

/**
 * A clickable list row with a delete action, aligned right and identical across rows.
 * Render inside `<ListRows>`.
 */
export function ListRow({ to, icon, name, meta, createdAt, deleteLabel, onDelete }: ListRowProps) {
  const { settings } = useSettings()
  return (
    <li className="group relative flex items-center gap-3 px-4 py-2.5 transition-colors has-[a:focus-visible]:bg-surface hover:bg-surface">
      <span className="shrink-0 text-muted">{icon}</span>
      <span className="min-w-0 flex-1">
        {/* Stretched link: the whole row is clickable, the delete button stays on top. */}
        <Link
          to={to}
          className="block truncate font-medium outline-none before:absolute before:inset-0 before:content-[''] focus-visible:before:ring-2 focus-visible:before:ring-accent focus-visible:before:ring-inset"
        >
          {name}
        </Link>
        {meta && <span className="mt-0.5 block truncate text-xs text-muted">{meta}</span>}
      </span>
      <time
        dateTime={createdAt}
        title={formatDateTime(createdAt, settings.language)}
        className="w-28 shrink-0 text-right text-xs text-muted tabular-nums"
      >
        {formatDate(createdAt, settings.language)}
      </time>
      <Button
        variant="ghost"
        iconOnly
        onClick={onDelete}
        aria-label={deleteLabel}
        title={deleteLabel}
        className="relative hover:text-danger"
      >
        <Trash2 aria-hidden className="size-3.5" />
      </Button>
    </li>
  )
}

interface ListRowsProps {
  label: string
  children: ReactNode
}

export function ListRows({ label, children }: ListRowsProps) {
  return (
    <ul
      aria-label={label}
      className="divide-y divide-border overflow-hidden rounded-xl border border-border"
    >
      {children}
    </ul>
  )
}

export function ListRowsSkeleton() {
  return (
    <ul
      aria-hidden
      className="divide-y divide-border overflow-hidden rounded-xl border border-border"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <li key={index} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-4" />
          <Skeleton className="h-3.5 w-48" />
          <span className="flex-1" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="size-7" />
        </li>
      ))}
    </ul>
  )
}
