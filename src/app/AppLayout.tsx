import {
  Building2,
  ChevronDown,
  ChevronRight,
  Images,
  Inbox,
  LayoutGrid,
  ListChecks,
  LogOut,
  Menu,
  Network,
  Play,
  Plus,
  Settings,
  Users,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { LiveBadge, OfflineBanner, TeamOnlineIndicator } from '@/components'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { StartWorkSheet } from '@/features/start/StartWorkSheet'
import { useInboxCount } from '@/hooks/queries'
import { useNow } from '@/hooks/useNow'
import { useI18n } from '@/i18n'
import { formatHeaderDate, ictHour } from '@/lib/time'
import { cn } from '@/lib/utils'
import { useAuth } from './auth'
import { useStartWork } from './startWork'

type MainNavKey = 'office' | 'org'
type LegacyNavKey = 'overview' | 'inbox' | 'tasks' | 'start' | 'library' | 'team'

const MAIN_NAV: { key: MainNavKey; to: string; icon: typeof Building2 }[] = [
  { key: 'office', to: '/', icon: Building2 },
  { key: 'org', to: '/org', icon: Network },
]

const LEGACY_NAV: { key: LegacyNavKey; to: string; icon: typeof Inbox }[] = [
  { key: 'overview', to: '/legacy', icon: LayoutGrid },
  { key: 'inbox', to: '/inbox', icon: Inbox },
  { key: 'tasks', to: '/tasks', icon: ListChecks },
  { key: 'start', to: '/start', icon: Play },
  { key: 'library', to: '/library', icon: Images },
  { key: 'team', to: '/team', icon: Users },
]

const LEGACY_PREFIXES = ['/legacy', '/inbox', '/tasks', '/start', '/library', '/team']

function isLegacyPath(pathname: string): boolean {
  return LEGACY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function Logo() {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-primary">
        <span className="size-3 rotate-45 rounded-[2px] bg-primary-foreground" />
      </span>
      <span className="text-[17px] font-semibold tracking-tight">{t.common.app.name}</span>
    </div>
  )
}

function InboxBadge({ className }: { className?: string }) {
  const { total } = useInboxCount()
  if (!total) return null
  return (
    <span
      className={cn(
        'tabular min-w-5 rounded-full bg-blocked px-1.5 text-center text-[11px] font-semibold leading-5 text-primary-foreground',
        className,
      )}
    >
      {total}
    </span>
  )
}

function Sidebar() {
  const { t } = useI18n()
  const { signOut } = useAuth()
  const { openStartWork } = useStartWork()
  const location = useLocation()
  const [legacyOpen, setLegacyOpen] = useState(() => isLegacyPath(location.pathname))

  const navCls = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] font-medium transition-colors',
      isActive
        ? 'bg-primary-soft text-primary'
        : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
    )

  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface px-3 py-5 lg:flex">
      <div className="px-2">
        <Logo />
      </div>

      <nav aria-label={t.common.nav.mainMenu} className="mt-8 flex flex-col gap-1 overflow-y-auto">
        {MAIN_NAV.map(({ key, to, icon: Icon }) => (
          <NavLink key={key} to={to} end={to === '/'} className={navCls}>
            <Icon className="size-[18px]" aria-hidden />
            <span className="flex-1">{t.common.nav[key]}</span>
          </NavLink>
        ))}

        <div className="mt-3 border-t border-border pt-3">
          <button
            type="button"
            aria-expanded={legacyOpen}
            onClick={() => setLegacyOpen((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            <span>{t.common.nav.legacyGroup}</span>
            {legacyOpen ? (
              <ChevronDown className="size-4" aria-hidden />
            ) : (
              <ChevronRight className="size-4" aria-hidden />
            )}
          </button>

          {legacyOpen && (
            <div className="mt-1 flex flex-col gap-1 pl-1">
              {LEGACY_NAV.map(({ key, to, icon: Icon }) => (
                <NavLink key={key} to={to} end={to === '/legacy'} className={navCls}>
                  <Icon className="size-[18px]" aria-hidden />
                  <span className="flex-1">{t.common.nav[key]}</span>
                  {key === 'inbox' && <InboxBadge />}
                </NavLink>
              ))}
              <div className="px-2 pt-2">
                <Button
                  size="sm"
                  onClick={() => openStartWork()}
                  className="w-full justify-center"
                >
                  <Plus className="size-4" aria-hidden />
                  <span>{t.common.actions.startWork}</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-border pt-4">
        <div className="px-3 pb-2">
          <TeamOnlineIndicator />
        </div>
        <NavLink to="/settings" className={navCls}>
          <Settings className="size-[18px]" aria-hidden />
          {t.common.nav.settings}
        </NavLink>
        <button type="button" onClick={signOut} className={navCls({ isActive: false })}>
          <LogOut className="size-[18px]" aria-hidden />
          {t.common.nav.signOut}
        </button>
      </div>
    </aside>
  )
}

function TopBar() {
  const { t, lang } = useI18n()
  const now = useNow(30_000)
  const h = ictHour(now)
  const greeting =
    h < 12
      ? t.common.greeting.morning
      : h < 18
        ? t.common.greeting.afternoon
        : t.common.greeting.evening

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
        <div className="lg:hidden">
          <Logo />
        </div>
        <div className="hidden min-w-0 lg:block">
          <p className="truncate text-[15px] font-semibold">{greeting}</p>
          <p className="tabular truncate text-[13px] text-muted-foreground first-letter:uppercase">
            {formatHeaderDate(now, lang)} ICT
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <span
            className="hidden rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline"
            title={t.common.demo.note}
          >
            {t.common.demo.badge}
          </span>
          <LiveBadge />
        </div>
      </div>
    </header>
  )
}

function MobileTabBar() {
  const { t } = useI18n()
  const { signOut } = useAuth()
  const { openStartWork } = useStartWork()
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()
  const [legacyOpen, setLegacyOpen] = useState(() => isLegacyPath(location.pathname))

  const moreActive =
    location.pathname.startsWith('/settings') || isLegacyPath(location.pathname)

  const tab = (active: boolean) =>
    cn(
      'relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
      active ? 'text-primary' : 'text-muted-foreground',
    )

  const items: { key: MainNavKey; to: string; icon: typeof Building2; label: string }[] = [
    { key: 'office', to: '/', icon: Building2, label: t.common.nav.office },
    { key: 'org', to: '/org', icon: Network, label: t.common.nav.org },
  ]

  return (
    <>
      <nav
        aria-label={t.common.nav.mainMenu}
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {items.map(({ key, to, icon: Icon, label }) => (
          <NavLink key={key} to={to} end={to === '/'} className={({ isActive }) => tab(isActive)}>
            <Icon className="size-5" aria-hidden />
            {label}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={tab(moreActive)}
          aria-haspopup="dialog"
        >
          <Menu className="size-5" aria-hidden />
          {t.common.nav.more}
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t.common.nav.more}</SheetTitle>
            <SheetDescription className="sr-only">
              {t.common.nav.mainMenu}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 flex flex-col gap-1">
            <NavLink
              to="/settings"
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-base hover:bg-surface-muted"
            >
              <Settings className="size-5 text-muted-foreground" aria-hidden />
              {t.common.nav.settings}
            </NavLink>

            <div className="my-2 border-t border-border pt-2">
              <button
                type="button"
                aria-expanded={legacyOpen}
                onClick={() => setLegacyOpen((prev) => !prev)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:bg-surface-muted"
              >
                <span>{t.common.nav.legacyGroup}</span>
                {legacyOpen ? (
                  <ChevronDown className="size-4" aria-hidden />
                ) : (
                  <ChevronRight className="size-4" aria-hidden />
                )}
              </button>

              {legacyOpen && (
                <div className="mt-1 flex flex-col gap-1 pl-2">
                  {LEGACY_NAV.map(({ key, to, icon: Icon }) => (
                    <NavLink
                      key={key}
                      to={to}
                      end={to === '/legacy'}
                      onClick={() => setMoreOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-surface-muted"
                    >
                      <Icon className="size-4 text-muted-foreground" aria-hidden />
                      <span className="flex-1">{t.common.nav[key]}</span>
                      {key === 'inbox' && <InboxBadge />}
                    </NavLink>
                  ))}
                  <div className="px-3 pt-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setMoreOpen(false)
                        openStartWork()
                      }}
                      className="w-full justify-center"
                    >
                      <Plus className="size-4" aria-hidden />
                      <span>{t.common.actions.startWork}</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="my-3 border-t border-border px-3 pt-4">
              <TeamOnlineIndicator />
            </div>

            <button
              type="button"
              onClick={signOut}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-base text-muted-foreground hover:bg-surface-muted"
            >
              <LogOut className="size-5" aria-hidden />
              {t.common.nav.signOut}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <OfflineBanner />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-28 pt-6 sm:px-6 lg:pb-10">
          {children}
        </main>
      </div>
      <MobileTabBar />
      <StartWorkSheet />
    </div>
  )
}
