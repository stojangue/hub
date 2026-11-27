import { createContext, useContext, useEffect } from 'react'
import { useMatches } from 'react-router'

export interface BreadcrumbLabelsValue {
  /** Labels set by pages, by route pathname. */
  labels: Readonly<Record<string, string>>
  setLabel: (pathname: string, label: string | undefined) => void
}

export const BreadcrumbLabelsContext = createContext<BreadcrumbLabelsValue | null>(null)

export function useBreadcrumbLabels(): BreadcrumbLabelsValue {
  const value = useContext(BreadcrumbLabelsContext)
  if (!value) throw new Error('useBreadcrumbLabels must be used inside <BreadcrumbLabelsProvider>')
  return value
}

/**
 * Sets the breadcrumb label of the current route, for routes with `dynamicCrumb`,
 * e.g. the name of the item a detail page shows. Pass `undefined` while it loads.
 */
export function useBreadcrumbLabel(label: string | undefined): void {
  const { setLabel } = useBreadcrumbLabels()
  const matches = useMatches()
  const pathname = matches[matches.length - 1]?.pathname

  useEffect(() => {
    if (!pathname) return
    setLabel(pathname, label)
    return () => setLabel(pathname, undefined)
  }, [pathname, label, setLabel])
}
