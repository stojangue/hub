import { Outlet, useMatches } from 'react-router'
import { Header } from '@renderer/components/Header'
import { Sidebar } from '@renderer/components/Sidebar'
import { cn } from '@renderer/lib/cn'
import { isRouteHandle } from '@renderer/lib/route-handle'

export function AppShell() {
  const matches = useMatches()
  const leaf = matches[matches.length - 1]
  const fill = isRouteHandle(leaf?.handle) && leaf.handle.layout === 'fill'

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main
          className={cn(
            'min-h-0 flex-1 select-text',
            fill ? 'overflow-hidden' : 'overflow-y-auto px-8 py-6',
          )}
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
