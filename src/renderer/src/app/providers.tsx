import { RouterProvider } from 'react-router'
import { router } from './router'

/** App-wide providers. Add context providers here as the app grows. */
export function Providers() {
  return <RouterProvider router={router} />
}
