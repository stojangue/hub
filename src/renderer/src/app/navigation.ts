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
  /** One sentence on what the feature is for, shown on its Overview card. */
  descriptionKey: TranslationKey
  to: string
  icon: LucideIcon
}

export const navigation: readonly NavItem[] = [
  {
    labelKey: 'nav.overview',
    descriptionKey: 'nav.overview.description',
    to: '/overview',
    icon: LayoutDashboard,
  },
  {
    labelKey: 'nav.devops',
    descriptionKey: 'nav.devops.description',
    to: '/devops',
    icon: InfinityIcon,
  },
  {
    labelKey: 'nav.blueprints',
    descriptionKey: 'nav.blueprints.description',
    to: '/blueprints',
    icon: DraftingCompass,
  },
  {
    labelKey: 'nav.jobs',
    descriptionKey: 'nav.jobs.description',
    to: '/jobs',
    icon: ClipboardList,
  },
]

/** Pinned at the bottom of the sidebar, separate from the main entries. */
export const settingsNavItem: NavItem = {
  labelKey: 'nav.settings',
  descriptionKey: 'nav.settings.description',
  to: '/settings',
  icon: Settings,
}
