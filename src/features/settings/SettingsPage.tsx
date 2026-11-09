import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import {
  CheckCircle2,
  KeyRound,
  Laptop,
  Loader2,
  LogOut,
  Radio,
  Server,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '@/app/auth'
import { useDrive } from '@/app/drive'
import { useI18n, type Lang } from '@/i18n'
import { useTeamOnline, useSystemStatus } from '@/hooks/queries'
import { formatDateTime } from '@/lib/time'
import { fmt, cn } from '@/lib/utils'
import {
  getConnection,
  isTeamOnline,
  setConnection,
  setTeamOnline,
  type ConnectionState,
} from '@/lib/mock/store'
import { PageHeader, TeamOnlineIndicator } from '@/components'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

export function SettingsPage() {
  const { t, lang, setLang } = useI18n()
  const { session, signOut } = useAuth()
  const drive = useDrive()
  const { heartbeatAt, version } = useTeamOnline()
  const { data: status } = useSystemStatus()

  // Change password dialog state
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  // Demo controls state
  const [teamOnlineLocal, setTeamOnlineLocal] = useState<boolean>(isTeamOnline)
  const [connState, setConnState] = useState<ConnectionState>(getConnection)

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setPasswordError(null)

    if (newPassword.length < 6) {
      setPasswordError(t.settings.account.passwordTooShort)
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t.settings.account.passwordsDoNotMatch)
      return
    }

    setPasswordSaving(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 700))
      setPasswordDialogOpen(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast.success(t.settings.account.successToast)
    } finally {
      setPasswordSaving(false)
    }
  }

  const handleTeamOnlineToggle = (checked: boolean) => {
    setTeamOnlineLocal(checked)
    setTeamOnline(checked)
  }

  const handleConnectionChange = (state: ConnectionState) => {
    setConnState(state)
    setConnection(state)
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader title={t.settings.title} description={t.settings.description} />

      <div className="max-w-2xl space-y-6">
        {/* 1. Language section */}
        <Card>
          <CardHeader>
            <div className="flex items-start gap-2.5 sm:items-center">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Radio className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <CardTitle>{t.settings.language.title}</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  {t.settings.language.description}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={lang}
              onValueChange={(val) => setLang(val as Lang)}
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            >
              <label
                htmlFor="lang-vi"
                className={cn(
                  'flex cursor-pointer items-center justify-between rounded-xl border p-3.5 transition-colors',
                  lang === 'vi'
                    ? 'border-primary bg-primary-soft/40'
                    : 'border-border bg-surface hover:bg-surface-muted',
                )}
              >
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="vi" id="lang-vi" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{t.settings.language.vi}</p>
                    <p className="text-xs text-muted-foreground">Mặc định · Tiếng Việt có dấu</p>
                  </div>
                </div>
                <span className="text-lg" aria-hidden>
                  🇻🇳
                </span>
              </label>

              <label
                htmlFor="lang-en"
                className={cn(
                  'flex cursor-pointer items-center justify-between rounded-xl border p-3.5 transition-colors',
                  lang === 'en'
                    ? 'border-primary bg-primary-soft/40'
                    : 'border-border bg-surface hover:bg-surface-muted',
                )}
              >
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="en" id="lang-en" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{t.settings.language.en}</p>
                    <p className="text-xs text-muted-foreground">English UI mode</p>
                  </div>
                </div>
                <span className="text-lg" aria-hidden>
                  🇬🇧
                </span>
              </label>
            </RadioGroup>
          </CardContent>
        </Card>

        {/* 2. Google Drive section */}
        <Card>
          <CardHeader>
            <div className="flex items-start gap-2.5 sm:items-center">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-sm font-bold text-primary">
                G
              </span>
              <div className="min-w-0">
                <CardTitle>{t.settings.drive.title}</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  {t.settings.drive.description}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-muted/30 p-3.5 sm:p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">
                  {t.settings.drive.statusLabel}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'size-2.5 rounded-full shrink-0',
                      drive.connected ? 'bg-done text-done animate-pulse-dot' : 'bg-idle',
                    )}
                    aria-hidden
                  />
                  <p className="text-sm font-medium text-foreground">
                    {drive.connected
                      ? fmt(t.settings.drive.connectedAs, { email: drive.accountEmail ?? '' })
                      : t.settings.drive.disconnected}
                  </p>
                </div>
              </div>

              {drive.connected ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => drive.disconnect()}
                  className="shrink-0"
                >
                  {t.settings.drive.disconnectButton}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void drive.connect()}
                  disabled={drive.state === 'connecting'}
                  className="shrink-0"
                >
                  {drive.state === 'connecting' && (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  )}
                  {drive.state === 'connecting'
                    ? t.settings.drive.connecting
                    : t.settings.drive.connectButton}
                </Button>
              )}
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-border/80 bg-surface p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <p>{t.settings.drive.securityNote}</p>
            </div>
          </CardContent>
        </Card>

        {/* 3. Account section */}
        <Card>
          <CardHeader>
            <div className="flex items-start gap-2.5 sm:items-center">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <KeyRound className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <CardTitle>{t.settings.account.title}</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  {t.settings.account.description}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-muted/30 p-3.5 sm:p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-xs text-muted-foreground">
                  {t.settings.account.emailLabel}
                </span>
                <p className="text-sm font-semibold text-foreground">
                  {session?.email ?? 'boss@example.com'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPasswordError(null)
                    setPasswordDialogOpen(true)
                  }}
                >
                  {t.settings.account.changePasswordButton}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => signOut()}
                  className="text-blocked hover:bg-status-blocked-soft hover:text-blocked"
                >
                  <LogOut className="size-4" aria-hidden />
                  <span>{t.settings.account.signOutButton}</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 4. System info section */}
        <Card>
          <CardHeader>
            <div className="flex items-start gap-2.5 sm:items-center">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Server className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <CardTitle>{t.settings.system.title}</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  {t.settings.system.description}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
              <div className="flex items-center justify-between p-3.5">
                <span className="text-muted-foreground">{t.settings.system.teamStatus}</span>
                <div>
                  <TeamOnlineIndicator />
                </div>
              </div>

              <div className="flex items-center justify-between p-3.5">
                <span className="text-muted-foreground">{t.settings.system.lastHeartbeat}</span>
                <span className="tabular font-medium text-foreground">
                  {heartbeatAt
                    ? formatDateTime(heartbeatAt, lang)
                    : t.settings.system.noHeartbeat}
                </span>
              </div>

              <div className="flex items-center justify-between p-3.5">
                <span className="text-muted-foreground">{t.settings.system.n8nVersion}</span>
                <span className="rounded-md bg-surface-muted px-2 py-0.5 font-mono text-xs text-foreground">
                  {version ?? status?.n8n_version ?? '1.74.2'}
                </span>
              </div>

              <div className="flex items-center justify-between p-3.5">
                <span className="text-muted-foreground">{t.settings.system.contractVersion}</span>
                <span className="rounded-md bg-primary-soft px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                  v0.2
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 5. Demo controls section (optimized for 375px mobile) */}
        <Card className="border-waiting/30 bg-surface">
          <CardHeader>
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-status-waiting-soft text-waiting">
                  <Sparkles className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 space-y-0.5">
                  <CardTitle className="text-base text-foreground">
                    {t.settings.demo.title}
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    {t.settings.demo.description}
                  </CardDescription>
                </div>
              </div>
              <div className="pl-10.5 sm:pl-0 shrink-0">
                <span className="inline-flex rounded-md border border-waiting/30 bg-status-waiting-soft px-2 py-0.5 text-[11px] font-semibold text-waiting">
                  {t.settings.demo.badge}
                </span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            {/* Control 1: Team online switch */}
            <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-surface-muted/30 p-3.5 sm:p-4">
              <div className="space-y-1 min-w-0">
                <Label htmlFor="demo-team-online" className="cursor-pointer font-medium text-foreground">
                  <div className="flex items-center gap-2">
                    <Laptop className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span>{t.settings.demo.teamOnlineLabel}</span>
                  </div>
                </Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t.settings.demo.teamOnlineHelp}
                </p>
              </div>
              <Switch
                id="demo-team-online"
                checked={teamOnlineLocal}
                onCheckedChange={handleTeamOnlineToggle}
                aria-label={t.settings.demo.teamOnlineLabel}
                className="shrink-0"
              />
            </div>

            {/* Control 2: Realtime connection 3-option control */}
            <div className="space-y-2.5 rounded-xl border border-border bg-surface-muted/30 p-3.5 sm:p-4">
              <div className="space-y-1">
                <Label className="font-medium text-foreground">
                  {t.settings.demo.connectionLabel}
                </Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t.settings.demo.connectionHelp}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {(['live', 'reconnecting', 'offline'] as const).map((option) => {
                  const isActive = connState === option
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => handleConnectionChange(option)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                        isActive
                          ? 'border-primary bg-primary-soft text-primary font-semibold shadow-xs'
                          : 'border-border bg-surface text-muted-foreground hover:bg-surface-muted hover:text-foreground',
                      )}
                    >
                      <span
                        className={cn(
                          'size-2 shrink-0 rounded-full',
                          option === 'live' && 'bg-done',
                          option === 'reconnecting' && 'bg-waiting',
                          option === 'offline' && 'bg-blocked',
                        )}
                        aria-hidden
                      />
                      <span>{t.settings.demo.connectionOptions[option]}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Change Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t.settings.account.dialogTitle}</DialogTitle>
            <DialogDescription>{t.settings.account.dialogDescription}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            {passwordError && (
              <div
                role="alert"
                className="rounded-xl border border-blocked/30 bg-status-blocked-soft p-3 text-xs text-blocked"
              >
                {passwordError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="current-password">
                {t.settings.account.currentPasswordLabel}
              </Label>
              <Input
                id="current-password"
                type="password"
                required
                placeholder={t.settings.account.currentPasswordPlaceholder}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={passwordSaving}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-password">{t.settings.account.newPasswordLabel}</Label>
              <Input
                id="new-password"
                type="password"
                required
                placeholder={t.settings.account.newPasswordPlaceholder}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={passwordSaving}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-new-password">
                {t.settings.account.confirmPasswordLabel}
              </Label>
              <Input
                id="confirm-new-password"
                type="password"
                required
                placeholder={t.settings.account.confirmPasswordPlaceholder}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={passwordSaving}
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPasswordDialogOpen(false)}
                disabled={passwordSaving}
              >
                {t.common.actions.cancel}
              </Button>
              <Button type="submit" variant="primary" disabled={passwordSaving}>
                {passwordSaving ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <CheckCircle2 className="size-4" aria-hidden />
                )}
                <span>
                  {passwordSaving
                    ? t.settings.account.saving
                    : t.settings.account.savePasswordButton}
                </span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
