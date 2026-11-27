/** Metadata attached to routes via `handle`. */
export interface RouteHandle {
  /** Label shown in the breadcrumbs. */
  crumb?: string
}

export function isRouteHandle(value: unknown): value is RouteHandle {
  return typeof value === 'object' && value !== null
}
