import { useEffect, useMemo, useState } from 'react'
import { api } from '@renderer/lib/api'

/**
 * Whether each folder exists: `true`, `false`, or missing while unchecked.
 * Checked again whenever the window gets focus, since folders change outside the app.
 */
export function useFolderStatus(paths: readonly string[]): Record<string, boolean> {
  const key = useMemo(() => [...new Set(paths)].sort().join('\n'), [paths])
  const [status, setStatus] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const list = key ? key.split('\n') : []
    if (list.length === 0) return
    let active = true
    function check() {
      api.folders.check(list).then(
        (result) => active && setStatus((current) => ({ ...current, ...result })),
        (error: unknown) => console.error('Failed to check folders', error),
      )
    }
    check()
    window.addEventListener('focus', check)
    return () => {
      active = false
      window.removeEventListener('focus', check)
    }
  }, [key])

  return status
}
