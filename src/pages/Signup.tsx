import { type FormEvent, useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { GoogleButton } from '../components/GoogleButton'
import { LanguageSwitch } from '../components/LanguageSwitch'
import { Button, Card, ErrorNote, Field, Logo, PageLoader, friendlyError } from '../components/ui'
import { createAccount, createOrganisationProfile, joinOrganisationProfile, lookupInvite, signOut } from '../data/account'
import { useAuth } from '../hooks/useAuth'
import { t } from '../lib/i18n'
import { editionById, rememberEdition, rememberedEdition } from '../lib/editions'
import { setPurpose } from '../lib/purpose'

export function Signup() {
  const { loading, user, profile } = useAuth()
  const [params] = useSearchParams()
  const [code, setCode] = useState(params.get('join')?.toUpperCase() ?? '')
  const [joining, setJoining] = useState(Boolean(params.get('join')))
  const [inviteOrg, setInviteOrg] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [organisation, setOrganisation] = useState('')
  // The landing page they came from decides what they are signing up for. There is no picker,
  // and it cannot be changed afterwards.
  const edition = editionById(params.get('for')) ?? rememberedEdition()
  useEffect(() => rememberEdition(edition.id), [edition])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // True while this form is creating a brand-new account (as opposed to finishing an old one).
  const [fresh, setFresh] = useState(false)

  // Show which organisation an invite code belongs to before the user commits.
  useEffect(() => {
    setInviteOrg(null)
    if (!joining || code.trim().length < 6) return
    let stale = false
    lookupInvite(code)
      .then((invite) => !stale && setInviteOrg(invite?.organisationName ?? null))
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [joining, code])

  useEffect(() => {
    if (user?.displayName) setName((n) => n || user.displayName || '')
  }, [user])

  if (!profile) setPurpose(edition.purpose)

  // While submitting, keep the form (with its busy button) on screen instead of flashing a loader.
  if (loading && !busy) return <PageLoader />
  if (user && profile) return <Navigate to="/app" replace />

  // A signed-in user without a profile is finishing a sign-up that was interrupted.
  const finishing = Boolean(user) && !fresh

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (joining && !(await lookupInvite(code))) throw new Error(t('That invite code is not valid.'))
      if (!finishing) {
        setFresh(true)
        await createAccount(name, email, password)
      }
      if (joining) await joinOrganisationProfile(name, code)
      else await createOrganisationProfile(name, organisation || `${name.trim()}'s sessions`, edition.purpose)
    } catch (err) {
      setError(friendlyError(err))
      setBusy(false)
      setFresh(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <Link to="/" className="mx-auto mb-8">
        <Logo className="text-xl" />
      </Link>
      <Card className="p-6">
        <h1 className="text-2xl font-semibold tracking-tight">{finishing ? t('Finish setting up') : t('Create your account')}</h1>
        <p className="mt-1 text-sm text-muted">
          {joining ? t('Join your organisation as a lecturer.') : t('Free to start. Ready in under a minute.')}
        </p>
        {!joining && (
          <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-sm">
            <span className="font-semibold">Attend · {t(edition.label)}</span>{' '}
            <Link to="/" className="font-medium text-accent">{t('Not you? See the others')}</Link>
          </p>
        )}
        {!finishing && (
          <div className="mt-6">
            <GoogleButton onError={setError} />
          </div>
        )}
        <form onSubmit={submit} className="mt-4 space-y-4">
          <Field label={t('Your name')} autoComplete="name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          {joining ? (
            <div>
              <Field
                label={t('Invite code')}
                required
                autoCapitalize="characters"
                maxLength={12}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
              {inviteOrg && <p className="mt-1.5 text-sm text-good">{t('Joining {name}', { name: inviteOrg })}</p>}
            </div>
          ) : (
            <Field
              label={t('Organisation')}
              hint={t('Optional')}
              placeholder={t(edition.orgPlaceholder)}
              maxLength={100}
              value={organisation}
              onChange={(e) => setOrganisation(e.target.value)}
            />
          )}
          {!finishing && (
            <>
              <Field label={t('Email')} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              <Field label={t('Password')} type="password" autoComplete="new-password" required minLength={6} hint={t('6+ characters')} value={password} onChange={(e) => setPassword(e.target.value)} />
            </>
          )}
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" size="lg" block busy={busy}>
            {finishing ? t('Continue') : t('Start Free')}
          </Button>
        </form>
        <button onClick={() => setJoining(!joining)} className="mt-4 w-full text-center text-sm font-medium text-accent">
          {joining ? t('Set up a new organisation instead') : t('Have an invite code from your organisation?')}
        </button>
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        {finishing ? (
          <button onClick={() => signOut()} className="font-medium text-accent">
            {t('Use a different account')}
          </button>
        ) : (
          <>
            {t('Already have an account?')}{' '}
            <Link to="/login" className="font-medium text-accent">
              {t('Log in')}
            </Link>
          </>
        )}
      </p>
      <LanguageSwitch className="mx-auto mt-5 !bg-white" />
    </div>
  )
}
