import type { TranslationKey } from '@renderer/i18n'

/** Metadata attached to routes via `handle`. */
export interface RouteHandle {
  /** Translation key of the label shown in the breadcrumbs. */
  crumb?: TranslationKey
}

export function isRouteHandle(value: unknown): value is RouteHandle {
  return typeof value === 'object' && value !== null
}
