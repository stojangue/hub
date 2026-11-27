import { GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft } from 'lucide-react'
import type { PullRequest } from '@shared/github'
import { CheckBadge, PullRequestStateBadge, ReviewBadge } from './badges'
import { ItemRow } from './ItemRow'

function PullRequestIcon({ pullRequest }: { pullRequest: PullRequest }) {
  if (pullRequest.state === 'merged') {
    return <GitMerge aria-hidden className="size-4 text-merged" />
  }
  if (pullRequest.state === 'closed') {
    return <GitPullRequestClosed aria-hidden className="size-4 text-danger" />
  }
  if (pullRequest.isDraft) return <GitPullRequestDraft aria-hidden className="size-4 text-muted" />
  return <GitPullRequest aria-hidden className="size-4 text-success" />
}

export function PullRequestRows({ pullRequests }: { pullRequests: PullRequest[] }) {
  return pullRequests.map((pr) => (
    <ItemRow
      key={pr.number}
      url={pr.url}
      number={pr.number}
      title={pr.title}
      icon={<PullRequestIcon pullRequest={pr} />}
      labels={pr.labels}
      author={pr.author?.login}
      updatedAt={pr.updatedAt}
      badges={
        <>
          <PullRequestStateBadge pullRequest={pr} />
          {pr.state === 'open' && <ReviewBadge status={pr.reviewStatus} />}
          <CheckBadge status={pr.checkStatus} />
        </>
      }
      meta={
        <>
          <span aria-hidden>·</span>
          <span
            className="max-w-64 truncate font-mono"
            title={`${pr.headBranch} → ${pr.baseBranch}`}
          >
            {pr.headBranch}
          </span>
        </>
      }
    />
  ))
}
