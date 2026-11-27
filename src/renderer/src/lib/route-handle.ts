import type { TranslationKey } from '@renderer/i18n'

/** Metadata attached to routes via `handle`. */
export interface RouteHandle {
  /** Translation key of the label shown in the breadcrumbs. */
  crumb?: TranslationKey
  /**
   * `fill` gives the page the full content area without padding or outer scrolling,
   * for layouts with their own scroll regions. Defaults to a padded, scrolling page.
   */
  layout?: 'padded' | 'fill'
}

export function isRouteHandle(value: unknown): value is RouteHandle {
  return typeof value === 'object' && value !== null
}
