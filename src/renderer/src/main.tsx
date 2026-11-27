import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { defaultSettings } from '@shared/settings'
import { Providers } from '@renderer/app/providers'
import { api } from '@renderer/lib/api'
import '@renderer/styles/globals.css'

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')

// Load settings before the first render, so the UI does not switch language after appearing.
const initialSettings = await api.settings.get().catch((error: unknown) => {
  console.error('Failed to load settings', error)
  return defaultSettings
})
document.documentElement.lang = initialSettings.language

createRoot(root).render(
  <StrictMode>
    <Providers initialSettings={initialSettings} />
  </StrictMode>,
)
