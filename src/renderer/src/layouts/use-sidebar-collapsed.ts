import { useCallback, useEffect, useState } from 'react'

const storageKey = 'hub.sidebar.collapsed'

function readStored(): boolean {
  try {
    return localStorage.getItem(storageKey) === 'true'
  } catch {
    return false
  }
}

/** Collapsed state of the sidebar, remembered across restarts and toggled with ⌘B. */
export function useSidebarCollapsed(): [collapsed: boolean, toggle: () => void] {
  const [collapsed, setCollapsed] = useState(readStored)

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(collapsed))
    } catch {
      // Not persisted; the sidebar still works for this session.
    }
  }, [collapsed])

  const toggle = useCallback(() => setCollapsed((value) => !value), [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) return
      if (!event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return
      if (event.key.toLowerCase() !== 'b') return
      event.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle])

  return [collapsed, toggle]
}
