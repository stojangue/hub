import { CircleCheck, CircleX, Clock, Eye, Globe, Lock } from 'lucide-react'
import type {
  CheckStatus,
  Label,
  PullRequest,
  RepositoryVisibility,
  ReviewStatus,
} from '@shared/github'
import { Badge, type BadgeTone } from '@renderer/components/Badge'
import { useT, type TranslationKey } from '@renderer/i18n'

const visibilityKeys: Record<RepositoryVisibility, TranslationKey> = {
  public: 'devops.visibility.public',
  private: 'devops.visibility.private',
  internal: 'devops.visibility.internal',
}

export function VisibilityBadge({ visibility }: { visibility: RepositoryVisibility }) {
  const t = useT()
  const Icon = visibility === 'public' ? Globe : Lock
  return (
    <Badge icon={<Icon aria-hidden className="size-3" />}>{t(visibilityKeys[visibility])}</Badge>
  )
}

/** A label with its GitHub color as a dot, so it stays readable in both themes. */
export function LabelBadge({ label }: { label: Label }) {
  const color = /^[0-9a-f]{6}$/i.test(label.color) ? `#${label.color}` : undefined
  return (
    <Badge
      icon={
        <span
          aria-hidden
          className="size-2 rounded-full bg-muted"
          style={color ? { backgroundColor: color } : undefined}
        />
      }
    >
      {label.name}
    </Badge>
  )
}

export function PullRequestStateBadge({ pullRequest }: { pullRequest: PullRequest }) {
  const t = useT()
  if (pullRequest.state === 'merged') {
    return <Badge tone="merged">{t('devops.pr.merged')}</Badge>
  }
  if (pullRequest.state === 'closed') {
    return <Badge tone="danger">{t('devops.pr.closed')}</Badge>
  }
  if (pullRequest.isDraft) return <Badge>{t('devops.pr.draft')}</Badge>
  return null
}

const reviewBadges: Record<
  Exclude<ReviewStatus, 'none'>,
  { tone: BadgeTone; key: TranslationKey; icon: typeof Eye }
> = {
  approved: { tone: 'success', key: 'devops.review.approved', icon: CircleCheck },
  changesRequested: { tone: 'danger', key: 'devops.review.changesRequested', icon: CircleX },
  reviewRequired: { tone: 'warning', key: 'devops.review.reviewRequired', icon: Eye },
}

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  const t = useT()
  if (status === 'none') return null
  const { tone, key, icon: Icon } = reviewBadges[status]
  return (
    <Badge
      tone={tone}
      title={t('devops.review.label')}
      icon={<Icon aria-hidden className="size-3" />}
    >
      {t(key)}
    </Badge>
  )
}

const checkBadges: Record<
  Exclude<CheckStatus, 'none'>,
  { tone: BadgeTone; key: TranslationKey; icon: typeof Eye }
> = {
  success: { tone: 'success', key: 'devops.checks.success', icon: CircleCheck },
  failure: { tone: 'danger', key: 'devops.checks.failure', icon: CircleX },
  pending: { tone: 'warning', key: 'devops.checks.pending', icon: Clock },
}

export function CheckBadge({ status }: { status: CheckStatus }) {
  const t = useT()
  if (status === 'none') return null
  const { tone, key, icon: Icon } = checkBadges[status]
  return (
    <Badge
      tone={tone}
      title={t('devops.checks.label')}
      icon={<Icon aria-hidden className="size-3" />}
    >
      {t(key)}
    </Badge>
  )
}
