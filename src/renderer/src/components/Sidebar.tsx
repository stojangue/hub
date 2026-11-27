import { NavLink } from 'react-router'
import { navigation, settingsNavItem, type NavItem } from '@renderer/app/navigation'
import { useT } from '@renderer/i18n'
import { cn } from '@renderer/lib/cn'

function SidebarLink({ item }: { item: NavItem }) {
  const t = useT()
  const { labelKey, to, icon: Icon } = item
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-md px-3 py-1.5 font-medium transition-colors',
          isActive ? 'bg-accent-soft text-accent' : 'text-foreground hover:bg-border/60',
        )
      }
    >
      <Icon aria-hidden className="size-4 shrink-0" strokeWidth={2} />
      {t(labelKey)}
    </NavLink>
  )
}

export function Sidebar() {
  const t = useT()
  return (
    <aside className="flex w-sidebar shrink-0 flex-col border-r border-border bg-surface">
      {/* Space for the macOS traffic lights; drags the window. */}
      <div className="h-titlebar shrink-0 app-drag" />

      <nav aria-label={t('nav.main')} className="flex-1 space-y-0.5 px-3">
        {navigation.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </nav>

      <div className="shrink-0 border-t border-border px-3 py-3">
        <SidebarLink item={settingsNavItem} />
      </div>
    </aside>
  )
}
