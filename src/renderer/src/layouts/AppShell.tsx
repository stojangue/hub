import { Outlet, useMatches } from 'react-router'
import { BreadcrumbLabelsProvider } from '@renderer/breadcrumbs/BreadcrumbLabelsProvider'
import { Header } from '@renderer/components/Header'
import { Sidebar } from '@renderer/components/Sidebar'
import { SidebarToggle } from '@renderer/components/SidebarToggle'
import { cn } from '@renderer/lib/cn'
import { isRouteHandle } from '@renderer/lib/route-handle'
import { useSidebarCollapsed } from './use-sidebar-collapsed'

export function AppShell() {
  const matches = useMatches()
  const leaf = matches[matches.length - 1]
  const [sidebarCollapsed, toggleSidebar] = useSidebarCollapsed()
  const fill = isRouteHandle(leaf?.handle) && leaf.handle.layout === 'fill'

  return (
    <BreadcrumbLabelsProvider>
      <div className="flex h-full">
        <Sidebar collapsed={sidebarCollapsed} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header sidebarCollapsed={sidebarCollapsed} />
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
      <SidebarToggle collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
    </BreadcrumbLabelsProvider>
  )
}
