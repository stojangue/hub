import { useCallback } from 'react'
import type { Repository } from '@shared/github'
import { gitHubIssueId, type WorkItem } from '@shared/work-items'
import { Select } from '@renderer/components/Select'
import { Skeleton } from '@renderer/components/Skeleton'
import { errorTitleKeys, toGitHubError } from '@renderer/github/errors'
import { unwrap } from '@renderer/github/queries'
import { useT } from '@renderer/i18n'
import { api } from '@renderer/lib/api'
import { useAsync, type AsyncState } from '@renderer/lib/use-async'

interface WorkItemPickerProps {
  /** Put on the repository picker, so a `<label htmlFor>` names it. */
  id: string
  /** Shared by all pickers in a dialog, so repositories load once. */
  repositories: AsyncState<Repository[]>
  repository: string
  onRepositoryChange: (fullName: string) => void
  value: WorkItem | null
  onChange: (item: WorkItem | null) => void
  /** Accessible name prefix, e.g. the work item node's name. */
  label: string
}

/** Picks a GitHub issue: first the repository, then one of its open issues. */
export function WorkItemPicker({
  id,
  repositories,
  repository,
  onRepositoryChange,
  value,
  onChange,
  label,
}: WorkItemPickerProps) {
  const t = useT()
  const [owner = '', name = ''] = repository.split('/')
  const loadIssues = useCallback(
    () =>
      repository
        ? unwrap(api.github.issues({ owner, name, state: 'open' }))
        : Promise.resolve(null),
    [repository, owner, name],
  )
  const issues = useAsync(loadIssues)

  if (repositories.loading) return <Skeleton className="h-8 w-full" />
  if (repositories.error) {
    return (
      <p role="alert" className="text-[0.8125rem] text-danger">
        {t(errorTitleKeys[toGitHubError(repositories.error).code])}
      </p>
    )
  }

  const issueList = issues.data?.items ?? []
  return (
    <div className="space-y-2" aria-label={label} role="group">
      <Select
        id={id}
        value={repository}
        onChange={(fullName) => {
          onRepositoryChange(fullName)
          onChange(null)
        }}
        placeholder={t('jobs.create.repositoryPlaceholder')}
        options={(repositories.data ?? [])
          .filter((repo) => !repo.isArchived)
          .map((repo) => ({ value: repo.fullName, label: repo.fullName }))}
      />
      {repository &&
        (issues.loading ? (
          <Skeleton className="h-8 w-full" />
        ) : issues.error ? (
          <p role="alert" className="text-[0.8125rem] text-danger">
            {t(errorTitleKeys[toGitHubError(issues.error).code])}
          </p>
        ) : issueList.length === 0 ? (
          <p className="text-[0.8125rem] text-muted">{t('jobs.create.noIssues')}</p>
        ) : (
          <Select
            value={value ? String(value.number) : ''}
            onChange={(number) => {
              const issue = issueList.find((candidate) => String(candidate.number) === number)
              onChange(
                issue
                  ? {
                      source: 'github',
                      id: gitHubIssueId(repository, issue.number),
                      title: issue.title,
                      url: issue.url,
                      repository,
                      number: issue.number,
                    }
                  : null,
              )
            }}
            placeholder={t('jobs.create.issuePlaceholder')}
            options={issueList.map((issue) => ({
              value: String(issue.number),
              label: `#${issue.number} ${issue.title}`,
            }))}
          />
        ))}
    </div>
  )
}
