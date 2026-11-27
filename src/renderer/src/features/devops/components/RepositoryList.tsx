import {
  Archive,
  CircleDot,
  GitFork,
  GitPullRequest,
  RefreshCw,
  Search,
  SearchX,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Repository } from '@shared/github'
import { Button } from '@renderer/components/Button'
import { EmptyState } from '@renderer/components/EmptyState'
import { GitHubErrorState } from '@renderer/github/GitHubErrorState'
import { useT } from '@renderer/i18n'
import { cn } from '@renderer/lib/cn'
import type { AsyncState } from '@renderer/lib/use-async'
import { RepositoryListSkeleton } from './skeletons'
import { VisibilityBadge } from './badges'

interface RepositoryListProps {
  state: AsyncState<Repository[]>
  selected: string | undefined
  onSelect: (fullName: string) => void
}

export function RepositoryList({ state, selected, onSelect }: RepositoryListProps) {
  const t = useT()
  const [query, setQuery] = useState('')
  const { data, error, loading, reloading, reload } = state

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!data || !needle) return data ?? []
    return data.filter(
      (repo) =>
        repo.fullName.toLowerCase().includes(needle) ||
        (repo.description?.toLowerCase().includes(needle) ?? false),
    )
  }, [data, query])

  return (
    <aside
      aria-label={t('devops.repos.label')}
      className="flex w-72 shrink-0 flex-col border-r border-border"
    >
      <div className="flex items-center gap-2 border-b border-border p-3">
        <label className="relative flex-1">
          <span className="sr-only">{t('devops.repos.search')}</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('devops.repos.search')}
            className="h-7 w-full rounded-md border border-border bg-background pr-2 pl-7 outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>
        <Button
          variant="ghost"
          iconOnly
          onClick={reload}
          disabled={loading || reloading}
          aria-label={t('devops.repos.refresh')}
          title={t('devops.repos.refresh')}
        >
          <RefreshCw aria-hidden className={cn('size-3.5', reloading && 'animate-spin')} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <RepositoryListSkeleton />
        ) : error ? (
          <GitHubErrorState error={error} onRetry={reload} retrying={reloading} />
        ) : data?.length === 0 ? (
          <EmptyState icon={GitFork} title={t('devops.repos.empty')} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title={t('devops.repos.noMatch')}
            description={t('devops.repos.noMatchHint')}
          />
        ) : (
          <ul className="space-y-0.5 p-2">
            {filtered.map((repo) => (
              <li key={repo.fullName}>
                <RepositoryEntry
                  repository={repo}
                  selected={repo.fullName === selected}
                  onSelect={() => onSelect(repo.fullName)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

interface RepositoryEntryProps {
  repository: Repository
  selected: boolean
  onSelect: () => void
}

function RepositoryEntry({ repository, selected, onSelect }: RepositoryEntryProps) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'w-full rounded-md px-3 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent',
        selected ? 'bg-accent-soft' : 'hover:bg-border/60',
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn('min-w-0 flex-1 truncate font-medium', selected && 'text-accent')}
          title={repository.fullName}
        >
          {repository.name}
        </span>
        {repository.isArchived && (
          <Archive
            aria-label={t('devops.repo.archived')}
            className="size-3.5 shrink-0 text-muted"
          />
        )}
        <VisibilityBadge visibility={repository.visibility} />
      </div>
      <div className="mt-1 flex items-center gap-3 text-xs text-muted">
        <span className="min-w-0 flex-1 truncate">{repository.owner}</span>
        <span
          className="inline-flex items-center gap-1 tabular-nums"
          title={t('devops.repo.openIssues')}
        >
          <CircleDot aria-hidden className="size-3" />
          <span className="sr-only">{t('devops.repo.openIssues')}: </span>
          {repository.openIssues}
        </span>
        <span
          className="inline-flex items-center gap-1 tabular-nums"
          title={t('devops.repo.openPullRequests')}
        >
          <GitPullRequest aria-hidden className="size-3" />
          <span className="sr-only">{t('devops.repo.openPullRequests')}: </span>
          {repository.openPullRequests}
        </span>
      </div>
    </button>
  )
}
