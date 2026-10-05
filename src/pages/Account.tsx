import { toPlanCard, useCatalog } from '../lib/pricing'
import { type FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, ErrorNote, Field, friendlyError, inputClass } from '../components/ui'
import { changeName, changePassword, getOrganisation, renameOrganisation, resendVerification, setPhoneCheckFor, setOrgSetting, setShifts, signOut } from '../data/account'
import { useCurrency } from '../lib/currency'
import { editionForPurpose } from '../lib/editions'
import { PAYMENTS_OPEN, PLAN_LABEL, activePlan, paidUntil, trialDaysLeft } from '../lib/plan'
import { getPurpose } from '../lib/purpose'
import { useAuth, useProfile } from '../hooks/useAuth'
import { LANGS, getLang, locale, setLang, t } from '../lib/i18n'
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


const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone
const ZONES = ['Asia/Kuala_Lumpur', 'Asia/Singapore', 'Asia/Jakarta', 'Asia/Bangkok', 'Asia/Manila', 'Asia/Brunei', 'Asia/Dubai', 'Europe/London', 'Australia/Sydney']

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
  const edition = editionForPurpose(getPurpose())
  const catalog = useCatalog()
  const plans = edition ? (catalog[edition.id] ?? []).filter((p) => !p.hidden).map(toPlanCard) : []
  const plan = activePlan()
  const currency = useCurrency()

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
        {profile.role === 'admin' && org && getPurpose() === 'workplace' && (
          <label className="mt-5 flex items-start gap-3 border-t border-line pt-4">
            <input
              type="checkbox"
              checked={Boolean(org.shifts)}
              onChange={(e) => {
                const on = e.target.checked
                orgSave.run(async () => {
                  await setShifts(org.id, on)
                  setOrg({ ...org, shifts: on })
                }, '')
              }}
              className="mt-1 size-4 accent-accent"
            />
            <span>
              <span className="block text-sm font-medium">{t('We work in shifts', undefined, true)}</span>
              <span className="block text-xs text-muted">{t('Adds several shifts, people who rotate between them, and a weekly shift plan. Leave it off for ordinary office hours.', undefined, true)}</span>
            </span>
          </label>
        )}
        {profile.role === 'admin' && org && getPurpose() === 'workplace' && (
          <label className="mt-5 block border-t border-line pt-4">
            <span className="mb-1.5 block text-sm font-medium">{t('A clock-in from a phone that is not their own')}</span>
            <select
              value={org.phoneCheck ?? 'flag'}
              onChange={(e) => {
                const value = e.target.value as 'flag' | 'block'
                orgSave.run(async () => {
                  await setPhoneCheckFor(org.id, value)
                  setOrg({ ...org, phoneCheck: value })
                }, '')
              }}
              className={inputClass}
            >
              <option value="flag">{t('Allow it, and flag it for me')}</option>
              <option value="block">{t('Refuse it until I approve the phone')}</option>
            </select>
            <span className="mt-1.5 block text-xs text-muted">{t('Each person’s first clock-in registers their phone. A new phone can be approved in one tap on the day’s list. Applies to days opened from now on.')}</span>
          </label>
        )}
        {profile.role === 'admin' && org && getPurpose() === 'workplace' && (
          <label className="mt-5 block border-t border-line pt-4">
            <span className="mb-1.5 block text-sm font-medium">{t('Overtime on a normal day starts')}</span>
            <select
              value={org.otRule ?? 'fullDay'}
              onChange={(e) => {
                const value = e.target.value as 'fullDay' | 'end'
                orgSave.run(async () => {
                  await setOrgSetting(org.id, 'otRule', value)
                  setOrg({ ...org, otRule: value })
                }, '')
              }}
              className={inputClass}
            >
              <option value="fullDay">{t('After a full day’s normal hours')}</option>
              <option value="end">{t('Any time after the end time')}</option>
            </select>
            <span className="mt-1.5 block text-xs text-muted">{t('With a full day, someone who comes in 45 minutes late and stays 30 minutes late has no overtime. Rest days and public holidays are always counted apart.')}</span>
          </label>
        )}
        {profile.role === 'admin' && org && getPurpose() === 'workplace' && (
          <label className="mt-5 block border-t border-line pt-4">
            <span className="mb-1.5 block text-sm font-medium">{t('Company time zone')}</span>
            <select
              value={org.timezone ?? browserZone}
              onChange={(e) => {
                const value = e.target.value
                orgSave.run(async () => {
                  await setOrgSetting(org.id, 'timezone', value)
                  setOrg({ ...org, timezone: value })
                }, '')
              }}
              className={inputClass}
            >
              {[...new Set([org.timezone ?? browserZone, browserZone, ...ZONES])].map((z) => (
                <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <span className="mt-1.5 block text-xs text-muted">{t('Reports warn when they are opened on a computer set to another time zone, because late and overtime minutes would shift.')}</span>
          </label>
        )}
        <p className="mt-3 text-sm text-muted">
          {t('Your role')}: <span className="font-medium text-ink">{profile.role === 'admin' ? t('Admin') : t('Lecturer')}</span>
        </p>
      </Card>

      {edition && (
        <Card className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">{t('Your plan')}</h2>
              <p className="mt-0.5 text-sm text-muted">Attend · {t(edition.label)}</p>
            </div>
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">{t(PLAN_LABEL[plan])}</span>
          </div>
          <p className="mt-3 text-sm text-slate-700">
            {plan === 'early'
              ? t('You joined during early access, so everything is free and without limits for now. We will tell you before that changes.')
              : plan === 'trial'
                ? t('You have Pro free for {n} more days. After that you move to the free plan; nothing is deleted.', { n: trialDaysLeft() ?? 0 })
                : plan === 'free'
                  ? PAYMENTS_OPEN
                    ? t('You are on the free plan. Your older records stay, ready to view and export.')
                    : t('You are on the free plan: {limit}. Paid plans open soon; the prices below are what they will cost. You will be told before anything changes.', { limit: t(plans.find((p) => /^(RM|\$)0$/.test(p.price.myr))?.items[0] ?? edition.plans[0]?.items[0] ?? '').toLowerCase() })
                  : t('You are on Pro until {date}. Thank you.', { date: new Date(paidUntil()?.toMillis() ?? 0).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' }) ?? '' })}
          </p>
          <ul className="mt-4 divide-y divide-line rounded-lg border border-line text-sm">
            {plans.map((p) => (
              <li key={p.name} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span>
                  <span className="font-semibold">{t(p.name)}</span>
                  <span className="text-muted"> · {t(p.items[0])}</span>
                </span>
                <span className="tabular whitespace-nowrap">
                  <span className="font-semibold">{p.price[currency]}</span> <span className="text-muted">{t(p.per)}</span>
                </span>
              </li>
            ))}
          </ul>
          {profile.role === 'admin' && plan !== 'pro' && (
            <div className="mt-4">
              <Button disabled={!PAYMENTS_OPEN}>{t('Upgrade to Pro')}</Button>
              {!PAYMENTS_OPEN && <p className="mt-2 text-xs text-muted">{plan === 'free' ? t('Paid plans open soon. Need more now? Contact Attend and we will set it up for you.') : t('Payment is not open yet. You do not need to do anything.')}</p>}
            </div>
          )}
        </Card>
      )}

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
