import { createHashRouter, Navigate, Outlet } from 'react-router-dom'
import { LoginPage } from '@/features/login/LoginPage'
import { OfficePage } from '@/features/office/OfficePage'
import { AppLayout } from './AppLayout'
import { AuthGuard } from './auth'
import { LegacyBoundary } from './LegacyBoundary'
import { RouteError } from './RouteError'

export const router = createHashRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteError /> },
  {
    path: '/reset-password',
    lazy: async () => ({
      Component: (await import('@/features/login/ResetPasswordPage')).ResetPasswordPage,
    }),
  },
  {
    element: (
      <AuthGuard>
        <AppLayout>
          <Outlet />
        </AppLayout>
      </AuthGuard>
    ),
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <OfficePage />, errorElement: <RouteError /> },
      {
        path: '/org',
        lazy: async () => ({
          Component: (await import('@/features/org/OrgPage')).OrgPage,
        }),
      },
      {
        path: '/settings',
        lazy: async () => ({
          Component: (await import('@/features/settings/SettingsPage')).SettingsPage,
        }),
      },
      {
        element: <LegacyBoundary />,
        children: [
          {
            path: '/legacy',
            lazy: async () => ({
              Component: (await import('@/features/overview/OverviewPage')).OverviewPage,
            }),
          },
          {
            path: '/inbox',
            lazy: async () => ({
              Component: (await import('@/features/inbox/InboxPage')).InboxPage,
            }),
          },
          {
            path: '/tasks',
            lazy: async () => ({
              Component: (await import('@/features/tasks/TasksPage')).TasksPage,
            }),
          },
          {
            path: '/tasks/:id',
            lazy: async () => ({
              Component: (await import('@/features/tasks/TaskDetailPage')).TaskDetailPage,
            }),
          },
          {
            path: '/start',
            lazy: async () => ({
              Component: (await import('@/features/start/StartPage')).StartPage,
            }),
          },
          {
            path: '/library',
            lazy: async () => ({
              Component: (await import('@/features/library/LibraryPage')).LibraryPage,
            }),
          },
          {
            path: '/team',
            lazy: async () => ({
              Component: (await import('@/features/team/TeamPage')).TeamPage,
            }),
          },
        ],
      },
      // Unknown hash (typo, or a dev-only route on the production build): go home.
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
