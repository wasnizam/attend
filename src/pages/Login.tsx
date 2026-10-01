import { type FormEvent, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { GoogleButton } from '../components/GoogleButton'
import { LanguageSwitch } from '../components/LanguageSwitch'
import { Button, Card, ErrorNote, Field, Logo, PageLoader, friendlyError } from '../components/ui'
import { resetPassword, signIn } from '../data/account'
import { useAuth } from '../hooks/useAuth'
import { t } from '../lib/i18n'

export function Login() {
  const { loading, user } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  if (loading) return <PageLoader />
  if (user) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/app'} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await signIn(email, password)
    } catch (err) {
      setError(friendlyError(err))
      setBusy(false)
    }
  }

  const forgot = async () => {
    setError('')
    setNotice('')
    if (!email.trim()) return setError(t('Enter your email first, then tap “Forgot password?”.'))
    try {
      await resetPassword(email)
      setNotice(t('If that email has an account, a reset link is on its way.'))
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <Link to="/" className="mx-auto mb-8">
        <Logo className="text-xl" />
      </Link>
      <Card className="p-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('Log in')}</h1>
        <div className="mt-6">
          <GoogleButton onError={setError} />
        </div>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <Field label={t('Email')} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Field label={t('Password')} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <ErrorNote>{error}</ErrorNote>
          {notice && <p className="rounded-lg bg-good-soft px-4 py-3 text-sm text-good">{notice}</p>}
          <Button type="submit" size="lg" block busy={busy}>
            {t('Log in')}
          </Button>
        </form>
        <button onClick={forgot} className="mt-4 w-full text-center text-sm font-medium text-accent">
          {t('Forgot password?')}
        </button>
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        {t('New here?')}{' '}
        <Link to="/signup" className="font-medium text-accent">
          {t('Create an account')}
        </Link>
      </p>
      <LanguageSwitch className="mx-auto mt-5 !bg-white" />
    </div>
  )
}
