import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '@/app/auth'
import { useI18n } from '@/i18n'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export function LoginPage() {
  const { session, signIn, sendPasswordReset } = useAuth()
  const { t } = useI18n()
  const location = useLocation()
  const navigate = useNavigate()

  const [mode, setMode] = useState<'login' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetSent, setResetSent] = useState(false)

  // Redirect if already signed in
  if (session) {
    return <Navigate to="/" replace />
  }

  const from = (location.state as { from?: string } | undefined)?.from || '/'

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signIn(email.trim(), password)
      navigate(from, { replace: true })
    } catch {
      setError(t.login.invalidCredentials)
    } finally {
      setLoading(false)
    }
  }

  const handleSendReset = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await sendPasswordReset(email.trim())
      setResetSent(true)
    } catch {
      // Supabase / auth reset does not leak email existence; show success anyway
      setResetSent(true)
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
              <span className="text-xl font-bold tracking-tight text-foreground">{t.common.app.name}</span>
            </div>
            <CardTitle className="text-lg">
              {mode === 'login' ? t.login.title : t.login.resetTitle}
            </CardTitle>
            <CardDescription>
              {mode === 'login' ? t.login.subtitle : t.login.resetSubtitle}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {error && (
              <div
                role="alert"
                className="mb-4 rounded-xl border border-blocked/30 bg-blocked-soft p-3 text-sm text-blocked"
              >
                {error}
              </div>
            )}

            {mode === 'login' ? (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="login-email">{t.login.emailLabel}</Label>
                  <Input
                    id="login-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder={t.login.emailPlaceholder}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password">{t.login.passwordLabel}</Label>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot')
                        setError(null)
                        setResetSent(false)
                      }}
                      className="text-xs text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {t.login.forgotPasswordLink}
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      placeholder={t.login.passwordPlaceholder}
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

                <Button type="submit" variant="primary" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  {loading ? t.login.signingIn : t.login.signInButton}
                </Button>
              </form>
            ) : resetSent ? (
              <div className="space-y-4 text-center">
                <div
                  role="status"
                  className="rounded-xl border border-primary/20 bg-primary-soft p-3 text-sm text-foreground"
                >
                  {t.login.resetSuccess}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setMode('login')
                    setError(null)
                    setResetSent(false)
                  }}
                >
                  {t.login.backToLogin}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSendReset} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="reset-email">{t.login.emailLabel}</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder={t.login.emailPlaceholder}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <Button type="submit" variant="primary" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  {loading ? t.login.sendingReset : t.login.sendResetButton}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login')
                      setError(null)
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {t.login.backToLogin}
                  </button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {t.login.demoHint}
        </p>
      </div>
    </div>
  )
}
