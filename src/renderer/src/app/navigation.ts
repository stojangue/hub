import { LayoutDashboard, type LucideIcon } from 'lucide-react'

/** Central sidebar navigation. Add an entry here when a feature gets a route. */
export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
}

export const navigation: readonly NavItem[] = [
  { label: 'Overview', to: '/overview', icon: LayoutDashboard },
]
