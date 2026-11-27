import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { BreadcrumbLabelsContext, type BreadcrumbLabelsValue } from './context'

export function BreadcrumbLabelsProvider({ children }: { children: ReactNode }) {
  const [labels, setLabels] = useState<Record<string, string>>({})

  const setLabel = useCallback((pathname: string, label: string | undefined) => {
    setLabels((previous) => {
      if (previous[pathname] === label) return previous
      const next = { ...previous }
      if (label === undefined) delete next[pathname]
      else next[pathname] = label
      return next
    })
  }, [])

  const value = useMemo<BreadcrumbLabelsValue>(() => ({ labels, setLabel }), [labels, setLabel])
  return <BreadcrumbLabelsContext value={value}>{children}</BreadcrumbLabelsContext>
}
