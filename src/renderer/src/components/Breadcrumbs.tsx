import { Fragment } from 'react'
import { Link, useMatches } from 'react-router'
import { useT } from '@renderer/i18n'
import { isRouteHandle } from '@renderer/lib/route-handle'

/** Builds breadcrumbs from the `handle.crumb` of every matched route. */
export function Breadcrumbs() {
  const t = useT()
  const crumbs = useMatches().flatMap((match) =>
    isRouteHandle(match.handle) && match.handle.crumb
      ? [{ id: match.id, label: t(match.handle.crumb), to: match.pathname }]
      : [],
  )

  return (
    <nav aria-label={t('breadcrumb.label')} className="flex items-center gap-1.5 text-muted">
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1
        return (
          <Fragment key={crumb.id}>
            {index > 0 && <span aria-hidden>/</span>}
            {isLast ? (
              <span aria-current="page" className="font-medium text-foreground">
                {crumb.label}
              </span>
            ) : (
              <Link to={crumb.to} className="app-no-drag hover:text-foreground">
                {crumb.label}
              </Link>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}
