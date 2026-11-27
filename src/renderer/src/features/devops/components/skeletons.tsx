import { Skeleton } from '@renderer/components/Skeleton'

export function RepositoryListSkeleton() {
  return (
    <ul aria-hidden className="space-y-1 p-2">
      {Array.from({ length: 8 }, (_, index) => (
        <li key={index} className="space-y-1.5 rounded-md px-3 py-2.5">
          <Skeleton className="h-3.5 w-3/5" />
          <Skeleton className="h-3 w-2/5" />
        </li>
      ))}
    </ul>
  )
}

export function ItemListSkeleton() {
  return (
    <ul aria-hidden className="divide-y divide-border">
      {Array.from({ length: 6 }, (_, index) => (
        <li key={index} className="flex gap-3 px-4 py-3">
          <Skeleton className="size-4 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Placeholder for the whole master–detail layout. */
export function BrowserSkeleton() {
  return (
    <div className="flex h-full">
      <div className="w-72 shrink-0 border-r border-border">
        <div className="border-b border-border p-3">
          <Skeleton className="h-7 w-full" />
        </div>
        <RepositoryListSkeleton />
      </div>
      <div className="flex-1 space-y-3 px-8 py-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-3.5 w-80" />
      </div>
    </div>
  )
}
