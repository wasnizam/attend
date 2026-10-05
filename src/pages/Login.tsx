import { type FormEvent, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { GoogleButton } from '../components/GoogleButton'
import { AuthShell } from '../components/AuthShell'
import { Button, ErrorNote, Field, PageLoader, friendlyError } from '../components/ui'
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
    <AuthShell
      footer={
        <>
          {t('New here?')} <Link to="/signup">{t('Create an account')}</Link>
        </>
      }
    >
      <h1 className="font-display text-3xl font-bold tracking-tight">{t('Welcome back')}</h1>
      <p className="mt-1 text-sm text-muted">{t('Log in to see who is in today.')}</p>
      <div className="mt-6">
        <GoogleButton onError={setError} />
      </div>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <Field label={t('Email')} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label={t('Password')} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <ErrorNote>{error}</ErrorNote>
        {notice && <p className="rounded-lg bg-good-soft px-4 py-3 text-sm text-good">{notice}</p>}
        <Button type="submit" variant="sun" size="lg" block busy={busy}>
          {t('Log in')}
        </Button>
      </form>
      <button onClick={forgot} className="mt-4 w-full text-center text-sm font-medium text-accent">
        {t('Forgot password?')}
      </button>
    </AuthShell>
  )
}
