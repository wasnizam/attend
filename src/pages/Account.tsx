import { type FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, ErrorNote, Field, friendlyError, inputClass } from '../components/ui'
import { changeName, changePassword, getOrganisation, renameOrganisation, resendVerification, setOrganisationPurpose, signOut } from '../data/account'
import { PURPOSES, type Purpose, getPurpose } from '../lib/purpose'
import { useAuth, useProfile } from '../hooks/useAuth'
import { LANGS, getLang, setLang, t } from '../lib/i18n'
import type { Organisation } from '../lib/types'

function Saved({ text }: { text: string }) {
  return text ? <p className="rounded-lg bg-good-soft px-4 py-3 text-sm text-good">{text}</p> : null
}

/** Each card saves on its own, so a mistake in one never blocks the others. */
function useSave() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const run = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true)
    setError('')
    setDone('')
    try {
      await fn()
      setDone(message)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, done, run }
}

export function Account() {
  const profile = useProfile()
  const { user } = useAuth()
  const navigate = useNavigate()
  const usesPassword = user?.providerData.some((p) => p.providerId === 'password') ?? false

  const [name, setName] = useState(profile.name)
  const nameSave = useSave()

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const passwordSave = useSave()

  const [org, setOrg] = useState<Organisation | null>(null)
  const [orgName, setOrgName] = useState('')
  const orgSave = useSave()
  useEffect(() => {
    getOrganisation(profile.organisationId).then((o) => {
      setOrg(o)
      setOrgName(o?.name ?? '')
    }, () => {})
  }, [profile.organisationId])

  const verifySave = useSave()
  const purposeSave = useSave()

  const submitPassword = (e: FormEvent) => {
    e.preventDefault()
    passwordSave.run(async () => {
      await changePassword(current, next)
      setCurrent('')
      setNext('')
    }, t('Password changed.'))
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('Account')}</h1>

      <Card className="space-y-4 p-5 sm:p-6">
        <h2 className="font-semibold">{t('Your details')}</h2>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            nameSave.run(() => changeName(name), t('Name saved.'))
          }}
        >
          <Field label={t('Your name')} required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          <div>
            <p className="text-sm font-medium">{t('Email')}</p>
            <p className="mt-1 text-muted break-all">{profile.email}</p>
            {usesPassword && user && !user.emailVerified && (
              <p className="mt-2 text-sm text-muted">
                {t('Not verified yet.')}{' '}
                <button
                  type="button"
                  disabled={verifySave.busy}
                  className="font-medium text-accent"
                  onClick={() => verifySave.run(resendVerification, t('Verification email sent. Check your inbox.'))}
                >
                  {t('Send the verification email again')}
                </button>
              </p>
            )}
          </div>
          <ErrorNote>{nameSave.error || verifySave.error}</ErrorNote>
          <Saved text={nameSave.done || verifySave.done} />
          <Button type="submit" variant="secondary" busy={nameSave.busy} disabled={!name.trim() || name.trim() === profile.name}>
            {t('Save name')}
          </Button>
        </form>
      </Card>

      {usesPassword && (
        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold">{t('Password')}</h2>
          <form onSubmit={submitPassword} className="mt-4 space-y-4">
            <Field label={t('Current password')} type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
            <Field label={t('New password')} hint={t('6+ characters')} type="password" autoComplete="new-password" required minLength={6} value={next} onChange={(e) => setNext(e.target.value)} />
            <ErrorNote>{passwordSave.error}</ErrorNote>
            <Saved text={passwordSave.done} />
            <Button type="submit" variant="secondary" busy={passwordSave.busy}>
              {t('Change password')}
            </Button>
          </form>
        </Card>
      )}

      <Card className="p-5 sm:p-6">
        <h2 className="font-semibold">{t('Organisation')}</h2>
        {profile.role === 'admin' && org ? (
          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              orgSave.run(async () => {
                await renameOrganisation(org, orgName)
                setOrg({ ...org, name: orgName.trim() })
              }, t('Organisation name saved.'))
            }}
          >
            <Field label={t('Organisation name')} required maxLength={100} value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            <ErrorNote>{orgSave.error}</ErrorNote>
            <Saved text={orgSave.done} />
            <Button type="submit" variant="secondary" busy={orgSave.busy} disabled={!orgName.trim() || orgName.trim() === org.name}>
              {t('Save organisation name')}
            </Button>
          </form>
        ) : (
          <p className="mt-2 text-muted">{org?.name ?? '—'}</p>
        )}
        {profile.role === 'admin' && org && (
          <label className="mt-5 block border-t border-line pt-4">
            <span className="mb-1.5 block text-sm font-medium">{t('What you use Attend for')}</span>
            <select
              value={getPurpose()}
              onChange={(e) => purposeSave.run(() => setOrganisationPurpose(org.id, e.target.value as Purpose), '')}
              className={inputClass}
            >
              {PURPOSES.map((p) => (
                <option key={p.id} value={p.id}>{t(p.label)}</option>
              ))}
            </select>
            <span className="mt-1.5 block text-xs text-muted">
              {t('This changes the words and the features everyone in your organisation sees. Nothing is deleted.')}
            </span>
            <ErrorNote>{purposeSave.error}</ErrorNote>
          </label>
        )}
        <p className="mt-3 text-sm text-muted">
          {t('Your role')}: <span className="font-medium text-ink">{profile.role === 'admin' ? t('Admin') : t('Lecturer')}</span>
        </p>
      </Card>

      <Card className="p-5 sm:p-6">
        <label className="block">
          <span className="mb-1.5 block font-semibold">{t('Language')}</span>
          <select value={getLang()} onChange={(e) => setLang(e.target.value as 'en' | 'ms')} className={inputClass}>
            {LANGS.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
        </label>
      </Card>

      <Button
        variant="secondary"
        block
        size="lg"
        onClick={async () => {
          await signOut()
          navigate('/')
        }}
      >
        {t('Log out')}
      </Button>
    </div>
  )
}
