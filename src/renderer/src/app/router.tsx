import { createHashRouter, Navigate } from 'react-router'
import { AppShell } from '@renderer/layouts/AppShell'
import { OverviewPage } from '@renderer/features/overview'
import { SettingsPage } from '@renderer/features/settings'
import type { RouteHandle } from '@renderer/lib/route-handle'

export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    handle: { crumb: 'nav.home' } satisfies RouteHandle,
    children: [
      { index: true, element: <Navigate to="/overview" replace /> },
      {
        path: 'overview',
        element: <OverviewPage />,
        handle: { crumb: 'nav.overview' } satisfies RouteHandle,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
        handle: { crumb: 'nav.settings' } satisfies RouteHandle,
      },
    ],
  },
])
