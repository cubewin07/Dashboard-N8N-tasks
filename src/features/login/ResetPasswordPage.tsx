import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useI18n } from '@/i18n'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export function ResetPasswordPage() {
  const { t } = useI18n()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError(t.login.resetPage.passwordTooShort)
      return
    }
    if (password !== confirmPassword) {
      setError(t.login.resetPage.passwordsDoNotMatch)
      return
    }

    setLoading(true)
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 800))
      setSuccess(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="flex min-h-screen w-full flex-col items-center justify-center bg-background px-4 py-8"
      style={{
        backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }}
    >
      <div className="w-full max-w-sm">
        <Card className="shadow-[var(--shadow-soft)]">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex items-center justify-center gap-2">
              <span className="text-xl font-bold text-primary" aria-hidden>
                ◆
              </span>
              <span className="text-xl font-bold tracking-tight text-foreground">Shop HQ</span>
            </div>
            <CardTitle className="text-lg">{t.login.resetPage.title}</CardTitle>
            <CardDescription>{t.login.resetPage.subtitle}</CardDescription>
          </CardHeader>

          <CardContent>
            {success ? (
              <div className="space-y-4 text-center">
                <div className="flex flex-col items-center gap-2 rounded-xl border border-done/30 bg-status-done-soft p-4 text-done">
                  <CheckCircle2 className="size-8" aria-hidden />
                  <p className="font-medium text-foreground">{t.login.resetPage.successTitle}</p>
                  <p className="text-xs text-muted-foreground">{t.login.resetPage.successMessage}</p>
                </div>
                <Button asChild variant="primary" className="w-full">
                  <Link to="/login">{t.login.resetPage.loginNow}</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div
                    role="alert"
                    className="rounded-xl border border-blocked/30 bg-status-blocked-soft p-3 text-sm text-blocked"
                  >
                    {error}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="reset-new-password">{t.login.resetPage.newPasswordLabel}</Label>
                  <div className="relative">
                    <Input
                      id="reset-new-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder={t.login.resetPage.newPasswordPlaceholder}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? t.login.hidePassword : t.login.showPassword}
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={loading}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {showPassword ? (
                        <EyeOff className="size-4" aria-hidden />
                      ) : (
                        <Eye className="size-4" aria-hidden />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reset-confirm-password">{t.login.resetPage.confirmPasswordLabel}</Label>
                  <div className="relative">
                    <Input
                      id="reset-confirm-password"
                      type={showConfirm ? 'text' : 'password'}
                      required
                      placeholder={t.login.resetPage.confirmPasswordPlaceholder}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={loading}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      aria-label={showConfirm ? t.login.hidePassword : t.login.showPassword}
                      onClick={() => setShowConfirm(!showConfirm)}
                      disabled={loading}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {showConfirm ? (
                        <EyeOff className="size-4" aria-hidden />
                      ) : (
                        <Eye className="size-4" aria-hidden />
                      )}
                    </button>
                  </div>
                </div>

                <Button type="submit" variant="primary" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  {loading ? t.login.resetPage.submitting : t.login.resetPage.submitButton}
                </Button>

                <div className="text-center">
                  <Link
                    to="/login"
                    className="text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {t.login.backToLogin}
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
