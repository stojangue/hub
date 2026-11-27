import { CircleCheck, CircleDot } from 'lucide-react'
import type { Issue } from '@shared/github'
import { ItemRow } from './ItemRow'

export function IssueRows({ issues }: { issues: Issue[] }) {
  return issues.map((issue) => (
    <ItemRow
      key={issue.number}
      url={issue.url}
      number={issue.number}
      title={issue.title}
      icon={
        issue.state === 'open' ? (
          <CircleDot aria-hidden className="size-4 text-success" />
        ) : (
          <CircleCheck aria-hidden className="size-4 text-merged" />
        )
      }
      labels={issue.labels}
      author={issue.author?.login}
      updatedAt={issue.updatedAt}
    />
  ))
}
