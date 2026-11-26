import { createHashRouter, Outlet } from 'react-router-dom'
import { LoginPage } from '@/features/login/LoginPage'
import { AppLayout } from './AppLayout'
import { AuthGuard } from './auth'
import { authPort } from './authRegistry'
import { can } from './roles'
import { LegacyBoundary } from './LegacyBoundary'
import { RouteError } from './RouteError'
import { RoleGuard, UnknownRoute } from './RoleGuard'

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
          <RoleGuard>
            <Outlet />
          </RoleGuard>
        </AppLayout>
      </AuthGuard>
    ),
    errorElement: <RouteError />,
    children: [
      {
        // Lazy so a stylist session never downloads the 3D office chunk.
        path: '/',
        lazy: async () => {
          // Router lazy() runs before any guard: check the role here so a stylist fetches nothing.
          if (!can(authPort.session()?.role, 'office')) return { Component: UnknownRoute }
          return { Component: (await import('@/features/office/OfficePage')).OfficePage }
        },
        errorElement: <RouteError />,
      },
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
        path: '/wardrobe',
        lazy: async () => ({
          Component: (await import('@/features/wardrobe/WardrobePage')).WardrobePage,
        }),
      },
      {
        // Quản trị (P10, R1): boss only. Checked before the chunk loads, like the office.
        path: '/admin',
        lazy: async () => {
          if (!can(authPort.session()?.role, 'admin')) return { Component: UnknownRoute }
          return { Component: (await import('@/features/admin/AdminPage')).AdminPage }
        },
        errorElement: <RouteError />,
      },
      {
        path: '/settings',
        lazy: async () => ({
          Component: (await import('@/features/settings/SettingsPage')).SettingsPage,
        }),
      },
      // Dev and debug builds only: every pose of the placeholder people.
      ...(import.meta.env.DEV || import.meta.env.VITE_DEBUG
        ? [
            {
              path: '/dev/people',
              lazy: async () => ({
                Component: (await import('@/scene/dev/PosePage')).PosePage,
              }),
            },
          ]
        : []),
      {
        path: '/credits',
        lazy: async () => ({
          Component: (await import('@/features/credits/CreditsPage')).CreditsPage,
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
      // Unknown hash (typo, or a dev-only route on the production build): go to the role's home.
      { path: '*', element: <UnknownRoute /> },
    ],
  },
])
