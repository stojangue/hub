import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Providers } from '@renderer/app/providers'
import '@renderer/styles/globals.css'

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')

createRoot(root).render(
  <StrictMode>
    <Providers />
  </StrictMode>,
)
