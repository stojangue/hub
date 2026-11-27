import { createHashRouter, Navigate } from 'react-router'
import { AppShell } from '@renderer/layouts/AppShell'
import { BlueprintDetailPage, BlueprintsPage } from '@renderer/features/blueprints'
import { DevOpsPage } from '@renderer/features/devops'
import { JobDetailPage, JobsPage } from '@renderer/features/jobs'
import { OverviewPage } from '@renderer/features/overview'
import { SettingsPage } from '@renderer/features/settings'
import type { RouteHandle } from '@renderer/lib/route-handle'

export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/overview" replace /> },
      {
        path: 'overview',
        element: <OverviewPage />,
        handle: { crumb: 'nav.overview' } satisfies RouteHandle,
      },
      {
        path: 'blueprints',
        handle: { crumb: 'nav.blueprints' } satisfies RouteHandle,
        children: [
          { index: true, element: <BlueprintsPage /> },
          {
            path: ':id',
            element: <BlueprintDetailPage />,
            handle: { dynamicCrumb: true, layout: 'fill' } satisfies RouteHandle,
          },
        ],
      },
      {
        path: 'jobs',
        handle: { crumb: 'nav.jobs' } satisfies RouteHandle,
        children: [
          { index: true, element: <JobsPage /> },
          {
            path: ':id',
            element: <JobDetailPage />,
            handle: { dynamicCrumb: true } satisfies RouteHandle,
          },
        ],
      },
      {
        path: 'devops',
        element: <DevOpsPage />,
        handle: { crumb: 'nav.devops', layout: 'fill' } satisfies RouteHandle,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
        handle: { crumb: 'nav.settings' } satisfies RouteHandle,
      },
    ],
  },
])
