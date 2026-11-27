import {
  DraftingCompass,
  InfinityIcon,
  LayoutDashboard,
  Settings,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react'
import type { TranslationKey } from '@renderer/i18n'

/** Central sidebar navigation. Add an entry here when a feature gets a route. */
export interface NavItem {
  labelKey: TranslationKey
  to: string
  icon: LucideIcon
}

export const navigation: readonly NavItem[] = [
  { labelKey: 'nav.overview', to: '/overview', icon: LayoutDashboard },
  { labelKey: 'nav.devops', to: '/devops', icon: InfinityIcon },
  { labelKey: 'nav.blueprints', to: '/blueprints', icon: DraftingCompass },
  { labelKey: 'nav.jobs', to: '/jobs', icon: ClipboardList },
]

/** Pinned at the bottom of the sidebar, separate from the main entries. */
export const settingsNavItem: NavItem = {
  labelKey: 'nav.settings',
  to: '/settings',
  icon: Settings,
}
