import { createHashRouter, Outlet } from 'react-router-dom'
import { LoginPage } from '@/features/login/LoginPage'
import { OfficePage } from '@/features/office/OfficePage'
import { AppLayout } from './AppLayout'
import { AuthGuard } from './auth'
import { LegacyBoundary } from './LegacyBoundary'

export const router = createHashRouter([
  { path: '/login', element: <LoginPage /> },
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
    children: [
      { path: '/', element: <OfficePage /> },
      {
        path: '/org',
        lazy: async () => ({
          Component: (await import('@/features/org/OrgPage')).OrgPage,
        }),
      },
      {
        path: '/queue',
        lazy: async () => ({
          Component: (await import('@/features/queue/QueuePage')).QueuePage,
        }),
      },
      {
        path: '/activity',
        lazy: async () => ({
          Component: (await import('@/features/activity/ActivityPage')).ActivityPage,
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
    ],
  },
])
