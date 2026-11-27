import type { ReactNode } from 'react'
import type { Label } from '@shared/github'
import { useT } from '@renderer/i18n'
import { formatDateTime, formatRelativeTime } from '@renderer/lib/relative-time'
import { useSettings } from '@renderer/settings/context'
import { LabelBadge } from './badges'

interface ItemRowProps {
  url: string
  number: number
  title: string
  /** State icon in front of the title. */
  icon: ReactNode
  labels: Label[]
  author: string | undefined
  updatedAt: string
  /** Extra status badges, shown after the labels. */
  badges?: ReactNode
  /** Extra details at the end of the meta line, e.g. the branch. */
  meta?: ReactNode
}

/** A compact, clickable row for an issue or pull request. Opens it on GitHub. */
export function ItemRow({
  url,
  number,
  title,
  icon,
  labels,
  author,
  updatedAt,
  badges,
  meta,
}: ItemRowProps) {
  const t = useT()
  const { settings } = useSettings()

  return (
    <li>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        title={t('devops.item.openOnGitHub')}
        className="flex gap-3 px-4 py-2.5 transition-colors outline-none hover:bg-surface focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
      >
        <span className="mt-0.5 shrink-0">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium break-words">{title}</span>
            {labels.map((label) => (
              <LabelBadge key={label.name} label={label} />
            ))}
            {badges}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
            <span className="tabular-nums">#{number}</span>
            {author && (
              <>
                <span aria-hidden>·</span>
                <span>{author}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <time dateTime={updatedAt} title={formatDateTime(updatedAt, settings.language)}>
              {t('devops.item.updated', {
                time: formatRelativeTime(updatedAt, settings.language),
              })}
            </time>
            {meta}
          </span>
        </span>
      </a>
    </li>
  )
}
