import { NavLink } from 'react-router'
import { navigation } from '@renderer/app/navigation'
import { cn } from '@renderer/lib/cn'

export function Sidebar() {
  return (
    <aside className="flex w-sidebar shrink-0 flex-col border-r border-border bg-surface">
      {/* Space for the macOS traffic lights; drags the window. */}
      <div className="h-titlebar shrink-0 app-drag" />

      <nav className="flex-1 space-y-0.5 px-3">
        {navigation.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-md px-3 py-1.5 font-medium transition-colors',
                isActive ? 'bg-accent-soft text-accent' : 'text-foreground hover:bg-border/60',
              )
            }
          >
            <Icon aria-hidden className="size-4 shrink-0" strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
