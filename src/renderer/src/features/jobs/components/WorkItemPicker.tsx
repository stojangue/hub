import { useCallback, useState } from 'react'
import type { ItemList, Repository } from '@shared/github'
import { gitHubItemId, type WorkItem, type WorkItemKind } from '@shared/work-items'
import { SegmentedControl } from '@renderer/components/SegmentedControl'
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

/** What both lists have in common, enough to make a work item. */
interface PickableItem {
  number: number
  title: string
  url: string
  isDraft?: boolean
}

/**
 * Picks a GitHub issue or pull request: first the kind and the repository, then one of its
 * open issues or pull requests.
 */
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
  const [kind, setKind] = useState<WorkItemKind>(value?.kind ?? 'issue')
  const [owner = '', name = ''] = repository.split('/')
  const loadItems = useCallback((): Promise<ItemList<PickableItem> | null> => {
    if (!repository) return Promise.resolve(null)
    const query = { owner, name, state: 'open' } as const
    return kind === 'pullRequest'
      ? unwrap(api.github.pullRequests(query))
      : unwrap(api.github.issues(query))
  }, [repository, owner, name, kind])
  const items = useAsync(loadItems)

  if (repositories.loading) return <Skeleton className="h-8 w-full" />
  if (repositories.error) {
    return (
      <p role="alert" className="text-[0.8125rem] text-danger">
        {t(errorTitleKeys[toGitHubError(repositories.error).code])}
      </p>
    )
  }

  const itemList = items.data?.items ?? []
  return (
    <div className="space-y-2" aria-label={label} role="group">
      <div className="text-[0.8125rem]">
        <SegmentedControl
          value={kind}
          onChange={(next) => {
            setKind(next)
            onChange(null)
          }}
          label={t('jobs.create.kind')}
          options={[
            { value: 'issue', label: t('jobs.create.kind.issue') },
            { value: 'pullRequest', label: t('jobs.create.kind.pullRequest') },
          ]}
        />
      </div>
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
        (items.loading ? (
          <Skeleton className="h-8 w-full" />
        ) : items.error ? (
          <p role="alert" className="text-[0.8125rem] text-danger">
            {t(errorTitleKeys[toGitHubError(items.error).code])}
          </p>
        ) : itemList.length === 0 ? (
          <p className="text-[0.8125rem] text-muted">
            {t(kind === 'pullRequest' ? 'jobs.create.noPullRequests' : 'jobs.create.noIssues')}
          </p>
        ) : (
          <Select
            value={value?.kind === kind ? String(value.number) : ''}
            onChange={(number) => {
              const item = itemList.find((candidate) => String(candidate.number) === number)
              onChange(
                item
                  ? {
                      source: 'github',
                      kind,
                      id: gitHubItemId(repository, item.number),
                      title: item.title,
                      url: item.url,
                      repository,
                      number: item.number,
                    }
                  : null,
              )
            }}
            placeholder={t(
              kind === 'pullRequest'
                ? 'jobs.create.pullRequestPlaceholder'
                : 'jobs.create.issuePlaceholder',
            )}
            options={itemList.map((item) => ({
              value: String(item.number),
              label: `#${item.number} ${item.title}${item.isDraft ? ` (${t('devops.pr.draft')})` : ''}`,
            }))}
          />
        ))}
    </div>
  )
}
