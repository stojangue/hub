import { FolderGit2 } from 'lucide-react'
import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { EmptyState } from '@renderer/components/EmptyState'
import { unwrap } from '@renderer/github/queries'
import { useT } from '@renderer/i18n'
import { api } from '@renderer/lib/api'
import { useAsync } from '@renderer/lib/use-async'
import { RepositoryDetail } from './RepositoryDetail'
import { RepositoryList } from './RepositoryList'

/** Master–detail view: repositories on the left, the selected one on the right. */
export function RepositoryBrowser() {
  const t = useT()
  const [searchParams, setSearchParams] = useSearchParams()
  const loadRepositories = useCallback(() => unwrap(api.github.repos()), [])
  const repositories = useAsync(loadRepositories)

  // The selection lives in the URL, so it survives navigating away and back.
  const selectedName = searchParams.get('repo')
  const list = repositories.data ?? []
  const selected = list.find((repo) => repo.fullName === selectedName) ?? list[0]

  function select(fullName: string) {
    setSearchParams(
      (params) => {
        params.set('repo', fullName)
        return params
      },
      { replace: true },
    )
  }

  return (
    <div className="flex h-full">
      <RepositoryList state={repositories} selected={selected?.fullName} onSelect={select} />
      <div className="min-w-0 flex-1">
        {selected ? (
          <RepositoryDetail
            key={selected.fullName}
            repository={selected}
            onRefreshRepository={repositories.reload}
          />
        ) : (
          !repositories.loading &&
          !repositories.error && (
            <EmptyState
              className="h-full"
              icon={FolderGit2}
              title={t('devops.repos.noneSelected')}
            />
          )
        )}
      </div>
    </div>
  )
}
