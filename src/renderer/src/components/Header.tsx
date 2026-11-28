import { cn } from '@renderer/lib/cn'
import { Breadcrumbs } from './Breadcrumbs'
import { sidebarTransition } from './Sidebar'

export function Header({ sidebarCollapsed }: { sidebarCollapsed: boolean }) {
  return (
    <header
      className={cn(
        // `pt-px` balances the 1px bottom border, so the breadcrumbs share the exact vertical
        // center (26px) with the window buttons and the sidebar toggle.
        'flex h-titlebar shrink-0 items-center border-b border-border pt-px pr-8 transition-[padding] app-drag',
        sidebarTransition,
        // Collapsed, the window buttons and the sidebar toggle overlap the header's left end, so
        // the breadcrumbs start right after the toggle instead of at the usual 32px inset.
        sidebarCollapsed
          ? 'pl-[calc(var(--spacing-titlebar-collapsed-inset)-var(--spacing-sidebar-collapsed))]'
          : 'pl-8',
      )}
    >
      <Breadcrumbs />
    </header>
  )
}
