import { GitBranch, LayoutDashboard, Settings, type LucideIcon } from 'lucide-react'
import type { TranslationKey } from '@renderer/i18n'

/** Central sidebar navigation. Add an entry here when a feature gets a route. */
export interface NavItem {
  labelKey: TranslationKey
  to: string
  icon: LucideIcon
}

export const navigation: readonly NavItem[] = [
  { labelKey: 'nav.overview', to: '/overview', icon: LayoutDashboard },
  { labelKey: 'nav.devops', to: '/devops', icon: GitBranch },
]

/** Pinned at the bottom of the sidebar, separate from the main entries. */
export const settingsNavItem: NavItem = {
  labelKey: 'nav.settings',
  to: '/settings',
  icon: Settings,
}
