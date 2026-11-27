import {
  Activity,
  Building2,
  CheckSquare,
  LogOut,
  Menu,
  Network,
  Settings,
  Shirt,
  SlidersHorizontal,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { LiveBadge, OfflineBanner, TeamOnlineIndicator } from '@/components'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { bossQueue } from '@/domain/selectors'
import { IntakeBox } from '@/features/office/IntakeBox'
import { useNow } from '@/hooks/useNow'
import { useI18n } from '@/i18n'
import { formatHeaderDate, ictHour } from '@/lib/time'
import { cn } from '@/lib/utils'
import { useOffice } from '@/office'
import { officeExtensions } from '@/office/extensions'
import { useOfficeSelector } from '@/office/hooks'
import { useAuth } from './auth'
import { useDeviceTierPreference } from './deviceTier'
import { can } from './roles'

type MainNavKey = 'office' | 'org' | 'queue' | 'activity' | 'wardrobe' | 'admin'

const MAIN_NAV: { key: MainNavKey; to: string; icon: typeof Building2 }[] = [
  { key: 'office', to: '/', icon: Building2 },
  { key: 'org', to: '/org', icon: Network },
  { key: 'queue', to: '/queue', icon: CheckSquare },
  { key: 'activity', to: '/activity', icon: Activity },
  { key: 'wardrobe', to: '/wardrobe', icon: Shirt },
  { key: 'admin', to: '/admin', icon: SlidersHorizontal },
]

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

function BossQueueBadge({ className }: { className?: string }) {
  const count = useOfficeSelector((s) => (s ? bossQueue(s).length : 0))
  if (count <= 0) return null
  return (
    <span
      data-nav-boss-queue-badge
      className={cn(
        'tabular min-w-5 rounded-full bg-blocked px-1.5 text-center text-[11px] font-semibold leading-5 text-primary-foreground',
        className,
      )}
    >
      {count}
    </span>
  )
}

function Sidebar() {
  const { t } = useI18n()
  const { session, signOut } = useAuth()
  const role = session?.role
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
        {MAIN_NAV.filter(({ key }) => can(role, key)).map(({ key, to, icon: Icon }) => (
          <NavLink key={key} to={to} end={to === '/'} className={navCls}>
            <Icon className="size-[18px]" aria-hidden />
            <span className="flex-1">{t.common.nav[key]}</span>
            {key === 'queue' && <BossQueueBadge />}
          </NavLink>
        ))}

      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-border pt-4">
        {can(role, 'command') && (
          <div className="px-3 pb-2">
            <TeamOnlineIndicator />
          </div>
        )}
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
  const { session } = useAuth()
  const role = session?.role
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
          {can(role, 'command') && <p className="truncate text-[15px] font-semibold">{greeting}</p>}
          <p className="tabular truncate text-[13px] text-muted-foreground first-letter:uppercase">
            {formatHeaderDate(now, lang)} ICT
          </p>
        </div>
        <div className="hidden flex-1 justify-center px-4 lg:flex">
          {can(role, 'command') && <IntakeBox compact />}
        </div>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <span
            className="hidden rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline"
            title={t.common.demo.note}
          >
            {t.common.demo.badge}
          </span>
          {can(role, 'office') && <LiveBadge />}
        </div>
      </div>
    </header>
  )
}

function MobileTabBar() {
  const { t } = useI18n()
  const { session, signOut } = useAuth()
  const role = session?.role
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()
  useOffice((s) => Boolean(s.state))
  const ControlPanel = officeExtensions.controlPanel

  const { tier } = useDeviceTierPreference()

  const moreActive =
    location.pathname.startsWith('/settings') ||
    location.pathname.startsWith('/admin')

  const tab = (active: boolean) =>
    cn(
      'relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
      active ? 'text-primary' : 'text-muted-foreground',
    )

  // R2: Sơ đồ · Duyệt · Hoạt động · Tủ đồ · Thêm (Cài đặt, Quản trị). On a phone `/` is the
  // 2D org view, so the first tab is "Sơ đồ" until the boss opts into 3D ("Văn phòng").
  const tabKeys: MainNavKey[] = can(role, 'office') ? ['office', 'queue', 'activity', 'wardrobe'] : ['wardrobe']
  const items = MAIN_NAV.filter(({ key }) => tabKeys.includes(key) && can(role, key)).map((n) =>
    n.key === 'office' && tier === 'fallback'
      ? { ...n, icon: Network, label: t.common.nav.org }
      : { ...n, label: t.common.nav[n.key] },
  )
  const orgActive = location.pathname === '/' || location.pathname.startsWith('/org')

  return (
    <>
      <nav
        aria-label={t.common.nav.mainMenu}
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {items.map(({ key, to, icon: Icon, label }) => (
          <NavLink
            key={key}
            to={to}
            end={to === '/'}
            data-tab={key}
            aria-current={key === 'office' && orgActive ? 'page' : undefined}
            className={({ isActive }) => tab(key === 'office' ? orgActive : isActive)}
          >
            <div className="relative flex items-center justify-center">
              <Icon className="size-5" aria-hidden />
              {key === 'queue' && (
                <BossQueueBadge className="absolute -right-3 -top-1.5 min-w-4 px-1 text-[10px] leading-4" />
              )}
            </div>
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
            {can(role, 'admin') && (
              <NavLink
                to="/admin"
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-base hover:bg-surface-muted"
              >
                <SlidersHorizontal className="size-5 text-muted-foreground" aria-hidden />
                {t.common.nav.admin}
              </NavLink>
            )}
            <NavLink
              to="/settings"
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-base hover:bg-surface-muted"
            >
              <Settings className="size-5 text-muted-foreground" aria-hidden />
              {t.common.nav.settings}
            </NavLink>

            {ControlPanel && can(role, 'command') && (
              <div className="my-2 border-t border-border pt-3">
                <ControlPanel />
              </div>
            )}


            {can(role, 'command') && (
              <div className="my-3 border-t border-border px-3 pt-4">
                <TeamOnlineIndicator />
              </div>
            )}

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
  const { t } = useI18n()
  return (
    <div className="flex min-h-dvh">
      {/* P11-T12: keyboard users jump past the sidebar and top bar. */}
      <a
        href="#main-content"
        onClick={(e) => {
          // HashRouter owns the hash: move focus instead of navigating.
          e.preventDefault()
          document.getElementById('main-content')?.focus()
        }}
        className="sr-only z-50 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t.common.nav.skipToMain}
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <OfflineBanner />
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-28 pt-6 outline-none sm:px-6 lg:pb-10"
        >
          {children}
        </main>
      </div>
      <MobileTabBar />
    </div>
  )
}
