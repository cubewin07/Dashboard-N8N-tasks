import { createHashRouter, Outlet } from 'react-router-dom'
import { AuthGuard } from './auth'
import { AppLayout } from './AppLayout'
import { LoginPage } from '@/features/login/LoginPage'
import { ResetPasswordPage } from '@/features/login/ResetPasswordPage'
import { OverviewPage } from '@/features/overview/OverviewPage'
import { InboxPage } from '@/features/inbox/InboxPage'
import { TasksPage } from '@/features/tasks/TasksPage'
import { TaskDetailPage } from '@/features/tasks/TaskDetailPage'
import { StartPage } from '@/features/start/StartPage'
import { LibraryPage } from '@/features/library/LibraryPage'
import { TeamPage } from '@/features/team/TeamPage'
import { SettingsPage } from '@/features/settings/SettingsPage'

export const router = createHashRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
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
      { path: '/inbox', element: <InboxPage /> },
      { path: '/tasks', element: <TasksPage /> },
      { path: '/tasks/:id', element: <TaskDetailPage /> },
      { path: '/start', element: <StartPage /> },
      { path: '/library', element: <LibraryPage /> },
      { path: '/team', element: <TeamPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
])
