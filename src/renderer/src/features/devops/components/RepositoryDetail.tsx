import { CircleDot, ExternalLink, GitPullRequest, Inbox, RefreshCw } from 'lucide-react'
import { useCallback, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import {
  itemStateFilters,
  type ItemList,
  type ItemStateFilter,
  type Repository,
} from '@shared/github'
import { Badge } from '@renderer/components/Badge'
import { Button } from '@renderer/components/Button'
import { EmptyState } from '@renderer/components/EmptyState'
import { SegmentedControl } from '@renderer/components/SegmentedControl'
import { Tabs } from '@renderer/components/Tabs'
import { GitHubErrorState } from '@renderer/github/GitHubErrorState'
import { unwrap } from '@renderer/github/queries'
import { useT, type TranslationKey } from '@renderer/i18n'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/cn'
import { useAsync } from '@renderer/lib/use-async'
import { VisibilityBadge } from './badges'
import { IssueRows } from './IssueList'
import { PullRequestRows } from './PullRequestList'
import { ItemListSkeleton } from './skeletons'

type Tab = 'issues' | 'pulls'

const stateFilterKeys: Record<ItemStateFilter, TranslationKey> = {
  open: 'devops.filter.open',
  closed: 'devops.filter.closed',
  all: 'devops.filter.all',
}

function parseTab(value: string | null): Tab {
  return value === 'pulls' ? 'pulls' : 'issues'
}

function parseStateFilter(value: string | null): ItemStateFilter {
  return (itemStateFilters as readonly (string | null)[]).includes(value)
    ? (value as ItemStateFilter)
    : 'open'
}

interface RepositoryDetailProps {
  repository: Repository
  /** Reloads the repository data, which holds the open counts shown in the tabs. */
  onRefreshRepository: () => void
}

export function RepositoryDetail({ repository, onRefreshRepository }: RepositoryDetailProps) {
  const t = useT()
  const [searchParams, setSearchParams] = useSearchParams()
  // Tab and filter live in the URL and stay the same when another repository is selected.
  const tab = parseTab(searchParams.get('tab'))
  const stateFilter = parseStateFilter(searchParams.get('state'))

  function setParam(name: string, value: string) {
    setSearchParams(
      (params) => {
        params.set(name, value)
        return params
      },
      { replace: true },
    )
  }

  const { owner, name } = repository
  const loadIssues = useCallback(
    () => unwrap(api.github.issues({ owner, name, state: stateFilter })),
    [owner, name, stateFilter],
  )
  const loadPullRequests = useCallback(
    () => unwrap(api.github.pullRequests({ owner, name, state: stateFilter })),
    [owner, name, stateFilter],
  )

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 px-8 pt-6">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-base font-semibold">
                <span className="font-normal text-muted">{repository.owner} / </span>
                {repository.name}
              </h1>
              <VisibilityBadge visibility={repository.visibility} />
              {repository.isArchived && <Badge tone="warning">{t('devops.repo.archived')}</Badge>}
              {repository.isFork && <Badge>{t('devops.repo.fork')}</Badge>}
            </div>
            <p className="mt-1 text-[0.8125rem] text-muted">
              {repository.description ?? t('devops.repo.noDescription')}
            </p>
          </div>
          <a
            href={repository.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-3 font-medium shadow-sm transition-colors outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ExternalLink aria-hidden className="size-3.5" />
            {t('devops.repo.openOnGitHub')}
          </a>
        </div>

        <div className="mt-5">
          <Tabs<Tab>
            label={t('devops.tabs.label')}
            value={tab}
            onChange={(value) => setParam('tab', value)}
            items={[
              {
                value: 'issues',
                label: t('devops.tabs.issues'),
                icon: <CircleDot aria-hidden className="size-4" />,
                count: repository.openIssues,
              },
              {
                value: 'pulls',
                label: t('devops.tabs.pulls'),
                icon: <GitPullRequest aria-hidden className="size-4" />,
                count: repository.openPullRequests,
              },
            ]}
          />
        </div>
      </header>

      <div role="tabpanel" className="flex min-h-0 flex-1 flex-col">
        {tab === 'issues' ? (
          <ItemPanel
            load={loadIssues}
            onRefresh={onRefreshRepository}
            stateFilter={stateFilter}
            onStateFilterChange={(value) => setParam('state', value)}
            emptyKey="devops.issues.empty"
            render={(issues) => <IssueRows issues={issues} />}
          />
        ) : (
          <ItemPanel
            load={loadPullRequests}
            onRefresh={onRefreshRepository}
            stateFilter={stateFilter}
            onStateFilterChange={(value) => setParam('state', value)}
            emptyKey="devops.pulls.empty"
            render={(pullRequests) => <PullRequestRows pullRequests={pullRequests} />}
          />
        )}
      </div>
    </div>
  )
}

interface ItemPanelProps<T> {
  load: () => Promise<ItemList<T>>
  /** Called alongside the item reload, so data outside the panel (tab counts) stays current. */
  onRefresh: () => void
  stateFilter: ItemStateFilter
  onStateFilterChange: (value: ItemStateFilter) => void
  emptyKey: TranslationKey
  render: (items: T[]) => ReactNode
}

function ItemPanel<T>({
  load,
  onRefresh,
  stateFilter,
  onStateFilterChange,
  emptyKey,
  render,
}: ItemPanelProps<T>) {
  const t = useT()
  const { data, error, loading, reloading, reload } = useAsync(load)

  function refresh() {
    reload()
    onRefresh()
  }

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-4 px-8 py-3">
        <SegmentedControl<ItemStateFilter>
          label={t('devops.filter.label')}
          value={stateFilter}
          options={itemStateFilters.map((value) => ({
            value,
            label: t(stateFilterKeys[value]),
          }))}
          onChange={onStateFilterChange}
        />
        <Button onClick={refresh} disabled={loading || reloading}>
          <RefreshCw aria-hidden className={cn('size-3.5', reloading && 'animate-spin')} />
          {t('common.refresh')}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-6">
        <div className="overflow-hidden rounded-xl border border-border">
          {loading ? (
            <ItemListSkeleton />
          ) : error ? (
            <GitHubErrorState error={error} onRetry={refresh} retrying={reloading} />
          ) : !data || data.items.length === 0 ? (
            <EmptyState icon={Inbox} title={t(emptyKey)} />
          ) : (
            <ul className={cn('divide-y divide-border', reloading && 'opacity-60')}>
              {render(data.items)}
            </ul>
          )}
        </div>
        {data?.truncated && (
          <p className="mt-3 text-center text-xs text-muted">
            {t('devops.list.truncated', { limit: data.limit })}
          </p>
        )}
      </div>
    </>
  )
}
