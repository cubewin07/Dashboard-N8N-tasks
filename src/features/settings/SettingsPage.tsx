import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Box,
  CheckCircle2,
  KeyRound,
  Loader2,
  Wind,
  LogOut,
  Radio,
} from 'lucide-react'
import { useAuth } from '@/app/auth'
import { can } from '@/app/roles'
import { useDeviceTierPreference, type DeviceTierOverride } from '@/app/deviceTier'
import { useI18n, type Lang } from '@/i18n'
import { isBackendConfigured } from '@/office/appearanceStore'
import { useOfficePrefs } from '@/office/prefs'
import { ImportLocalLooks } from './ImportLocalLooks'
import { fmt, cn } from '@/lib/utils'
import { PageHeader } from '@/components'
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
  const { session, signIn, signOut, updatePassword } = useAuth()
  const full = can(session?.role, 'settings.full')
  const { tier, override: tierOverride, setOverride: setTierOverride } = useDeviceTierPreference()
  const reducedMotionChoice = useOfficePrefs((s) => s.reducedMotionChoice)
  const systemReducedMotion = useOfficePrefs((s) => s.systemReducedMotion)
  const setReducedMotion = useOfficePrefs((s) => s.setReducedMotion)
  const dayNight = useOfficePrefs((s) => s.dayNight)
  const setDayNight = useOfficePrefs((s) => s.setDayNight)
  const motionValue =
    reducedMotionChoice === null ? 'system' : reducedMotionChoice ? 'on' : 'off'

  // Change password dialog state
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

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
      if (updatePassword && session) {
        // Re-check the current password first: an open session alone must not be enough.
        try {
          await signIn(session.email, currentPassword)
        } catch {
          setPasswordError(t.settings.account.currentPasswordWrong)
          return
        }
        await updatePassword(newPassword)
      } else await new Promise((resolve) => setTimeout(resolve, 700))
      setPasswordDialogOpen(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast.success(t.settings.account.successToast)
    } catch {
      setPasswordError(t.login.resetPage.failed)
    } finally {
      setPasswordSaving(false)
    }
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
                    <p className="text-xs text-muted-foreground">{t.settings.language.viSubtitle}</p>
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
                    <p className="text-xs text-muted-foreground">{t.settings.language.enSubtitle}</p>
                  </div>
                </div>
                <span className="text-lg" aria-hidden>
                  🇬🇧
                </span>
              </label>
            </RadioGroup>
          </CardContent>
        </Card>

{full && (
<>
        {/* 1b. Device tier section (3D / 2D) */}
        <Card>
          <CardHeader>
            <div className="flex items-start gap-2.5 sm:items-center">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Box className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <CardTitle>{t.settings.deviceTier.title}</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  {t.settings.deviceTier.description}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <RadioGroup
              value={tierOverride}
              onValueChange={(val) => setTierOverride(val as DeviceTierOverride)}
              className="grid grid-cols-1 gap-3 sm:grid-cols-3"
              aria-label={t.settings.deviceTier.title}
            >
              {(
                [
                  {
                    value: 'auto',
                    label: t.settings.deviceTier.options.auto,
                    sub: t.settings.deviceTier.options.autoSubtitle,
                  },
                  {
                    value: 'full3d',
                    label: t.settings.deviceTier.options.full3d,
                    sub: t.settings.deviceTier.options.full3dSubtitle,
                  },
                  {
                    value: 'fallback',
                    label: t.settings.deviceTier.options.fallback,
                    sub: t.settings.deviceTier.options.fallbackSubtitle,
                  },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.value}
                  htmlFor={`device-tier-${opt.value}`}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors',
                    tierOverride === opt.value
                      ? 'border-primary bg-primary-soft/40'
                      : 'border-border bg-surface hover:bg-surface-muted',
                  )}
                >
                  <RadioGroupItem
                    value={opt.value}
                    id={`device-tier-${opt.value}`}
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.sub}</p>
                  </div>
                </label>
              ))}
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              {fmt(t.settings.deviceTier.activeLabel, {
                mode: t.settings.deviceTier.activeModes[tier],
              })}
            </p>
          </CardContent>
        </Card>

        {/* 1c. Motion and lighting in the 3D office (P05 R14, R11) */}
        <Card data-settings-motion>
          <CardHeader>
            <div className="flex items-start gap-2.5 sm:items-center">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Wind className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <CardTitle>{t.settings.motion.title}</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  {t.settings.motion.description}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2.5">
              <div className="space-y-1">
                <p id="reduced-motion-label" className="text-sm font-medium text-foreground">
                  {t.settings.motion.reducedLabel}
                </p>
                <p className="text-xs text-muted-foreground">{t.settings.motion.reducedHelp}</p>
              </div>
              <RadioGroup
                value={motionValue}
                onValueChange={(val) =>
                  setReducedMotion(val === 'system' ? null : val === 'on')
                }
                className="grid grid-cols-1 gap-3 sm:grid-cols-3"
                aria-labelledby="reduced-motion-label"
              >
                {(
                  [
                    {
                      value: 'system',
                      label: t.settings.motion.options.system,
                      sub: fmt(t.settings.motion.options.systemSubtitle, {
                        state: systemReducedMotion
                          ? t.settings.motion.systemOn
                          : t.settings.motion.systemOff,
                      }),
                    },
                    {
                      value: 'on',
                      label: t.settings.motion.options.on,
                      sub: t.settings.motion.options.onSubtitle,
                    },
                    {
                      value: 'off',
                      label: t.settings.motion.options.off,
                      sub: t.settings.motion.options.offSubtitle,
                    },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.value}
                    htmlFor={`reduced-motion-${opt.value}`}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors',
                      motionValue === opt.value
                        ? 'border-primary bg-primary-soft/40'
                        : 'border-border bg-surface hover:bg-surface-muted',
                    )}
                  >
                    <RadioGroupItem
                      value={opt.value}
                      id={`reduced-motion-${opt.value}`}
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.sub}</p>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-surface-muted/30 p-3.5 sm:p-4">
              <div className="space-y-1">
                <Label htmlFor="settings-day-night" className="font-medium text-foreground">
                  {t.settings.motion.dayNightLabel}
                </Label>
                <p className="text-xs text-muted-foreground">{t.settings.motion.dayNightHelp}</p>
              </div>
              <Switch
                id="settings-day-night"
                checked={dayNight}
                onCheckedChange={setDayNight}
                className="shrink-0"
              />
            </div>
          </CardContent>
        </Card>

        </>
)}

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
                  {session?.email ?? t.settings.account.defaultEmail}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {full && (
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
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => signOut()}
                  className="text-blocked hover:bg-blocked-soft hover:text-blocked"
                >
                  <LogOut className="size-4" aria-hidden />
                  <span>{t.settings.account.signOutButton}</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {session?.role === 'boss' && isBackendConfigured() && <ImportLocalLooks />}

        {/* Asset credits */}
        <Card>
          <CardHeader>
            <CardTitle>{t.credits.settingsCard.title}</CardTitle>
            <CardDescription>{t.credits.settingsCard.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/credits" data-credits-link>
                {t.credits.settingsCard.open}
              </Link>
            </Button>
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
                className="rounded-xl border border-blocked/30 bg-blocked-soft p-3 text-xs text-blocked"
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
                autoComplete="current-password"
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
                autoComplete="new-password"
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
                autoComplete="new-password"
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
