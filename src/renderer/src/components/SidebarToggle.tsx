import { PanelLeft } from 'lucide-react'
import { useT } from '@renderer/i18n'
import { sidebarId } from './Sidebar'
import { Button } from './Button'

interface SidebarToggleProps {
  collapsed: boolean
  onToggle: () => void
}

/**
 * Pinned right of the macOS window buttons. It never moves: expanded it sits in the sidebar's
 * titlebar, collapsed the header slides in underneath it.
 */
export function SidebarToggle({ collapsed, onToggle }: SidebarToggleProps) {
  const t = useT()
  const label = t(collapsed ? 'sidebar.expand' : 'sidebar.collapse')
  return (
    <Button
      variant="ghost"
      iconOnly
      aria-label={label}
      title={`${label} (⌘B)`}
      aria-controls={sidebarId}
      aria-expanded={!collapsed}
      onClick={onToggle}
      // 32px square like the collapsed nav rows, centered in the titlebar: (52 − 32) / 2 = 10px.
      className="fixed top-2.5 left-sidebar-toggle z-10 size-8 app-no-drag"
    >
      <PanelLeft aria-hidden className="size-4" strokeWidth={2} />
    </Button>
  )
}
