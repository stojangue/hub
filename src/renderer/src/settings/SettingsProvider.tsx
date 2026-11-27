import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Settings } from '@shared/settings'
import { api } from '@renderer/lib/api'
import { SettingsContext, type SettingsContextValue } from './context'

interface SettingsProviderProps {
  /** Loaded before the first render, so the UI starts in the stored language. */
  initialSettings: Settings
  children: ReactNode
}

export function SettingsProvider({ initialSettings, children }: SettingsProviderProps) {
  const [settings, setSettings] = useState(initialSettings)

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    // Optimistic update: the UI reacts at once, the main process returns the stored result.
    setSettings((previous) => ({ ...previous, ...patch }))
    try {
      setSettings(await api.settings.set(patch))
    } catch (error) {
      console.error('Failed to save settings', error)
      setSettings(await api.settings.get())
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = settings.language
  }, [settings.language])

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, updateSettings }),
    [settings, updateSettings],
  )

  return <SettingsContext value={value}>{children}</SettingsContext>
}
