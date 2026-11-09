import { createHashRouter, Outlet } from 'react-router-dom'
import { AuthGuard } from './auth'
import { AppLayout } from './AppLayout'
import { LoginPage } from '@/features/login/LoginPage'
import { OverviewPage } from '@/features/overview/OverviewPage'

export const router = createHashRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/reset-password', lazy: async () => ({ Component: (await import('@/features/login/ResetPasswordPage')).ResetPasswordPage }) },
  {
    element: (
      <AuthGuard>
        <AppLayout>
          <Outlet />
        </AppLayout>
      </AuthGuard>
    ),
    children: [
      { path: '/', element: <OverviewPage /> },
      { path: '/inbox', lazy: async () => ({ Component: (await import('@/features/inbox/InboxPage')).InboxPage }) },
      { path: '/tasks', lazy: async () => ({ Component: (await import('@/features/tasks/TasksPage')).TasksPage }) },
      { path: '/tasks/:id', lazy: async () => ({ Component: (await import('@/features/tasks/TaskDetailPage')).TaskDetailPage }) },
      { path: '/start', lazy: async () => ({ Component: (await import('@/features/start/StartPage')).StartPage }) },
      { path: '/library', lazy: async () => ({ Component: (await import('@/features/library/LibraryPage')).LibraryPage }) },
      { path: '/team', lazy: async () => ({ Component: (await import('@/features/team/TeamPage')).TeamPage }) },
      { path: '/settings', lazy: async () => ({ Component: (await import('@/features/settings/SettingsPage')).SettingsPage }) },
    ],
  },
])
