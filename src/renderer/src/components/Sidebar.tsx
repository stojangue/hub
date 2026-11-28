import { NavLink } from 'react-router'
import { navigation, settingsNavItem, type NavItem } from '@renderer/app/navigation'
import { useT } from '@renderer/i18n'
import { cn } from '@renderer/lib/cn'

export const sidebarId = 'app-sidebar'

/**
 * Shared by everything that changes when the sidebar collapses (sidebar width, titlebar colors,
 * header inset), so all of it moves as one.
 */
export const sidebarTransition = 'duration-200 ease-out motion-reduce:transition-none'

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const t = useT()
  const { labelKey, to, icon: Icon } = item
  const label = t(labelKey)
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      // The label is clipped at the content box, never wrapped or unmounted: the icon keeps its
      // exact position and the label simply disappears behind the edge as the sidebar narrows.
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 overflow-clip rounded-md px-2 py-1.5 font-medium whitespace-nowrap transition-colors [overflow-clip-margin:content-box]',
          isActive ? 'bg-accent-soft text-accent' : 'text-foreground hover:bg-border/60',
        )
      }
    >
      <Icon aria-hidden className="size-4 shrink-0" strokeWidth={2} />
      {label}
    </NavLink>
  )
}

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const t = useT()
  return (
    <aside
      id={sidebarId}
      className={cn(
        'flex shrink-0 flex-col overflow-hidden transition-[width]',
        sidebarTransition,
        collapsed ? 'w-sidebar-collapsed' : 'w-sidebar',
      )}
    >
      {/*
       * Space for the macOS window buttons and the sidebar toggle; drags the window.
       * Expanded it belongs to the sidebar, collapsed it takes on the header's look, so the
       * window buttons and the toggle read as part of the breadcrumb bar.
       */}
      <div
        className={cn(
          'h-titlebar shrink-0 border-r border-b transition-colors app-drag',
          sidebarTransition,
          collapsed
            ? 'border-r-transparent border-b-border bg-background'
            : 'border-r-border border-b-transparent bg-surface',
        )}
      />

      <div className="flex min-h-0 flex-1 flex-col border-r border-border bg-surface">
        <nav aria-label={t('nav.main')} className="flex-1 space-y-1 px-4 pt-2">
          {navigation.map((item) => (
            <SidebarLink key={item.to} item={item} collapsed={collapsed} />
          ))}
        </nav>

        <div className="shrink-0 border-t border-border p-4">
          <SidebarLink item={settingsNavItem} collapsed={collapsed} />
        </div>
      </div>
    </aside>
  )
}
