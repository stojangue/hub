import { createHashRouter, Navigate } from 'react-router'
import { AppShell } from '@renderer/layouts/AppShell'
import { OverviewPage } from '@renderer/features/overview'
import type { RouteHandle } from '@renderer/lib/route-handle'

export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    handle: { crumb: 'Home' } satisfies RouteHandle,
    children: [
      { index: true, element: <Navigate to="/overview" replace /> },
      {
        path: 'overview',
        element: <OverviewPage />,
        handle: { crumb: 'Overview' } satisfies RouteHandle,
      },
    ],
  },
])
