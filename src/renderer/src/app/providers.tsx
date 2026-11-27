import { RouterProvider } from 'react-router'
import type { Settings } from '@shared/settings'
import { SettingsProvider } from '@renderer/settings/SettingsProvider'
import { router } from './router'

interface ProvidersProps {
  initialSettings: Settings
}

/** App-wide providers. Add context providers here as the app grows. */
export function Providers({ initialSettings }: ProvidersProps) {
  return (
    <SettingsProvider initialSettings={initialSettings}>
      <RouterProvider router={router} />
    </SettingsProvider>
  )
}
