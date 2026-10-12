import { MAX_SEATS, monthPrice, offersYear, toPlanCard, useCatalog, yearPrice } from '../lib/pricing'
import { type FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, ErrorNote, Field, friendlyError, inputClass } from '../components/ui'
import { changeName, changePassword, getOrganisation, renameOrganisation, resendVerification, setPhoneCheckFor, setOrgSetting, setShifts, signOut } from '../data/account'
import { useCurrency } from '../lib/currency'
import { editionForPurpose } from '../lib/editions'
import { GRACE_DAYS, PAYMENTS_OPEN, PLAN_LABEL, activePlan, allows, canPay, paidUntil, trialDaysLeft } from '../lib/plan'
import { InstallApp } from '../components/InstallApp'
import { UpgradeNote } from '../components/Paid'
import { openBilling, redeemCode, resumePlan, startCheckout } from '../data/billing'
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
  const listed = edition ? (catalog[edition.id] ?? []).filter((p) => !p.hidden) : []
  const plans = listed.map(toPlanCard)
  // Paying: only an admin, and only once payments are open (or this browser is trying them out).
  const paying = profile.role === 'admin' && canPay()
  const yearOffer = listed.some(offersYear)
  const [yearly, setYearly] = useState(false)
  const [busyPlan, setBusyPlan] = useState<string | null>(null)
  const [payError, setPayError] = useState('')
  const [code, setCode] = useState('')
  const [codeBusy, setCodeBusy] = useState(false)
  const [codeNote, setCodeNote] = useState<{ ok: boolean; text: string } | null>(null)
  // Back from Stripe's payment page.
  const [paidNotice] = useState(() => new URLSearchParams(window.location.search).get('paid') === '1')
  // Lecturers wanted, for a plan priced per lecturer (the Faculty plan).
  const [seats, setSeats] = useState<number | null>(null)
  const choose = async (planId: string, byYear: boolean, quantity = 1) => {
    setBusyPlan(planId)
    setPayError('')
    try {
      // 'leaving': the browser is on its way to Stripe, so the button keeps spinning.
      if ((await startCheckout(planId, currency, byYear, quantity)) === 'changed') setBusyPlan(null)
    } catch (e) {
      setPayError(e instanceof Error ? e.message : String(e))
      setBusyPlan(null)
    }
  }
  const resume = async () => {
    setBusyPlan('resume')
    setPayError('')
    try {
      await resumePlan()
      // Stripe tells the server, which updates the organisation a moment later.
      setOrg((o) => (o ? { ...o, stripeCancelAtPeriodEnd: false } : o))
    } catch (e) {
      setPayError(e instanceof Error ? e.message : String(e))
    }
    setBusyPlan(null)
  }
  const manage = async (flow?: 'cancel') => {
    setBusyPlan(flow ?? 'portal')
    setPayError('')
    try {
      await openBilling(flow)
    } catch (e) {
      setPayError(e instanceof Error ? e.message : String(e))
      setBusyPlan(null)
    }
  }
  const plan = activePlan()
  const currency = useCurrency()
  // The plan they pay for, by name; when it ends or renews; and whether they have cancelled it.
  const myPlan = plan === 'pro' ? listed.find((p) => p.id === org?.stripePlanId) : undefined
  const cancelled = plan === 'pro' && Boolean(org?.stripeCancelAtPeriodEnd)
  const longDate = (ms: number) => new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' })
  const until = longDate(paidUntil()?.toMillis() ?? 0)
  // What is stored runs a few days past the paid period, while a failed card is retried.
  const renews = longDate((paidUntil()?.toMillis() ?? 0) - GRACE_DAYS * 86_400_000)

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
              checked={Boolean(org.shifts) && allows('shifts')}
              disabled={!allows('shifts')}
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
              {!allows('shifts') && <UpgradeNote what={t('Night, rotating and planned shifts are part of the paid plans.')} className="my-1" />}
              <span className="block text-xs text-muted">{t('Adds several shifts, people who rotate between them, and a weekly shift plan. Leave it off for ordinary office hours.', undefined, true)}</span>
            </span>
          </label>
        )}
        {profile.role === 'admin' && org && getPurpose() === 'workplace' && (
          <label className="mt-5 block border-t border-line pt-4">
            <span className="mb-1.5 block text-sm font-medium">{t('A clock-in from a phone that is not their own')}</span>
            <select
              value={allows('phoneCheck') ? (org.phoneCheck ?? 'flag') : 'flag'}
              disabled={!allows('phoneCheck')}
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
            {!allows('phoneCheck') && <UpgradeNote what={t('Refusing a clock-in from someone else’s phone is part of the paid plans.')} className="mt-2" />}
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
        <Card className="overflow-hidden">
          {/* What they have now, and what they can do about it. */}
          <div className="relative isolate bg-night px-5 py-5 text-white sm:px-6">
            <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(28rem_12rem_at_100%_0%,rgb(255_200_61/0.16),transparent_70%)]" />
            <p className="text-xs font-semibold tracking-wide text-white/60 uppercase">{t('Your plan')} · Dobry {t(edition.label)}</p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
              <div className="min-w-0">
                <p className="font-display text-3xl font-bold tracking-tight">
                  {t(myPlan?.name ?? PLAN_LABEL[plan])}
                  {myPlan?.perSeat && org?.seats ? <span className="ml-2 text-base font-medium text-white/70">{t('{n} lecturers', { n: org.seats })}</span> : null}
                </p>
                <p className="mt-1 max-w-md text-sm text-indigo-100/85">
                  {plan === 'early'
                    ? t('You joined during early access, so everything is free and without limits for now. We will tell you before that changes.')
                    : plan === 'trial'
                      ? t('You have Pro free for {n} more days. After that you move to the free plan; nothing is deleted.', { n: trialDaysLeft() ?? 0 })
                      : plan === 'free'
                        ? PAYMENTS_OPEN
                          ? t('You are on the free plan. Your older records stay, ready to view and export.')
                          : t('You are on the free plan: {limit}. Paid plans open soon; the prices below are what they will cost. You will be told before anything changes.', { limit: t(plans.find((p) => /^(RM|\$)0$/.test(p.price.myr))?.items[0] ?? edition.plans[0]?.items[0] ?? '').toLowerCase() })
                        : cancelled
                          ? t('Cancelled. It stays on until {date}, then moves to the free plan.', { date: until })
                          : org?.stripeSubscriptionId
                            ? t('Renews on {date}.', { date: renews })
                            : t('On until {date}.', { date: until })}
                </p>
              </div>
              {paying && org?.stripeCustomerId && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {plan === 'pro' && org.stripeSubscriptionId && cancelled && (
                    <Button variant="sun" busy={busyPlan === 'resume'} disabled={busyPlan !== null} onClick={resume}>{t('Resume plan')}</Button>
                  )}
                  <Button variant="secondary" busy={busyPlan === 'portal'} disabled={busyPlan !== null} onClick={() => manage()} className="!bg-white/10 !text-white ring-1 ring-white/25 hover:!bg-white/15">
                    {t('Manage billing')}
                  </Button>
                  {plan === 'pro' && org.stripeSubscriptionId && !cancelled && (
                    <button type="button" disabled={busyPlan !== null} onClick={() => manage('cancel')} className="text-sm font-medium text-white/70 underline underline-offset-2 hover:text-white disabled:opacity-50">
                      {busyPlan === 'cancel' ? t('Opening…') : t('Cancel plan')}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="p-5 sm:p-6">
            {paidNotice && <p className="mb-4 rounded-lg bg-good-soft px-4 py-3 text-sm text-good">{plan === 'pro' ? t('Payment received. You are on Pro. Thank you.') : t('Payment received. Your plan will update in a few seconds.')}</p>}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">{paying && plan === 'pro' ? t('Change plan') : t('Plans')}</h2>
              {yearOffer && paying && (
                <div role="group" aria-label={t('Billed')} className="inline-flex rounded-full bg-slate-100 p-0.5 text-xs font-semibold">
                  {([false, true] as const).map((y) => (
                    <button key={String(y)} type="button" aria-pressed={yearly === y} onClick={() => setYearly(y)} className={`rounded-full px-3 py-1.5 transition ${yearly === y ? 'bg-white text-ink shadow-card' : 'text-slate-600 hover:text-ink'}`}>
                      {y ? t('Yearly') : t('Monthly')}
                      {y && <span className="ml-1.5 rounded-full bg-good-soft px-1.5 py-0.5 text-[10px] text-good">{t('2 months free')}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <ul className="mt-3 space-y-2.5">
              {listed.map((cp) => {
                const p = toPlanCard(cp)
                const paid = cp.cycle !== 'free'
                const mine = plan === 'pro' ? org?.stripePlanId === cp.id : !paid && plan === 'free'
                const byYear = yearly && offersYear(cp)
                const least = cp.perSeat ? Math.max(1, cp.minSeats ?? 1) : 1
                const count = cp.perSeat ? Math.min(MAX_SEATS, Math.max(least, seats ?? (mine ? org?.seats ?? least : least))) : 1
                // On a per-lecturer plan already: the button changes how many lecturers it covers.
                const same = mine && (!cp.perSeat || count === (org?.seats ?? 1))
                return (
                  <li key={cp.id} className={`rounded-xl px-4 py-3.5 ${mine ? 'bg-accent-soft/50 ring-2 ring-accent' : 'ring-1 ring-line'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                      <div className="min-w-0 flex-1 basis-52">
                        <p className="flex flex-wrap items-center gap-2 font-semibold">
                          {t(p.name)}
                          {mine && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">{t('Your plan')}</span>}
                        </p>
                        <p className="mt-0.5 text-sm text-muted">{t(p.items[0])}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="tabular text-right leading-tight whitespace-nowrap">
                          <span className="text-xl font-semibold tracking-tight">{byYear ? yearPrice(cp, currency, count) : cp.perSeat ? monthPrice(cp, currency, count) : p.price[currency]}</span>
                          <span className="block text-xs text-muted">{!paid ? t(p.per) : byYear ? t('a year') : t('a month')}</span>
                        </p>
                        {paid && paying && !same && (
                          <Button variant={plan === 'pro' ? 'secondary' : 'primary'} busy={busyPlan === cp.id} disabled={busyPlan !== null} onClick={() => choose(cp.id, byYear, count)} className="min-w-24">
                            {mine ? t('Update') : plan === 'pro' ? t('Switch') : t('Choose')}
                          </Button>
                        )}
                      </div>
                    </div>
                    {cp.perSeat && paying && (
                      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-sm">
                        <span className="text-muted">{t('Lecturers')}</span>
                        <div className="inline-flex items-center rounded-lg ring-1 ring-line">
                          <button type="button" aria-label={t('One fewer')} disabled={count <= least} onClick={() => setSeats(count - 1)} className="size-9 text-lg text-slate-600 hover:bg-slate-50 disabled:opacity-30">−</button>
                          <input type="number" aria-label={t('Lecturers')} min={least} max={MAX_SEATS} step={1} value={seats ?? count} onChange={(e) => setSeats(Number(e.target.value))} onBlur={() => setSeats(count)} className="tabular h-9 w-14 border-x border-line bg-transparent text-center font-semibold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                          <button type="button" aria-label={t('One more')} disabled={count >= MAX_SEATS} onClick={() => setSeats(count + 1)} className="size-9 text-lg text-slate-600 hover:bg-slate-50 disabled:opacity-30">+</button>
                        </div>
                        <span className="text-xs text-muted">{t('{price} for each lecturer', { price: byYear ? yearPrice(cp, currency) : monthPrice(cp, currency) })}</span>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
            <ErrorNote>{payError}</ErrorNote>

            {profile.role === 'admin' && (
              <p className="mt-3 text-xs text-muted">
                {paying
                  ? t('Payment is handled by Stripe. Dobry never sees your card. You can cancel at any time; your records stay.')
                  : plan === 'pro'
                    ? ''
                    : plan === 'free'
                      ? t('Paid plans open soon. Need more now? Contact Dobry and we will set it up for you.')
                      : t('Payment is not open yet. You do not need to do anything.')}
              </p>
            )}

            {profile.role === 'admin' && (
              <details className="group mt-4 border-t border-line pt-4" open={Boolean(codeNote) || undefined}>
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-accent [&::-webkit-details-marker]:hidden">
                  {t('Have a code?')}
                  <span aria-hidden className="transition group-open:rotate-90">›</span>
                </summary>
                <form
                  className="mt-3"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    setCodeBusy(true)
                    setCodeNote(null)
                    try {
                      const { until } = await redeemCode(code)
                      setCode('')
                      setCodeNote({ ok: true, text: t('Code accepted. You have Pro until {date}.', { date: new Date(until).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' }) }) })
                    } catch (err) {
                      setCodeNote({ ok: false, text: err instanceof Error ? err.message : String(err) })
                    } finally {
                      setCodeBusy(false)
                    }
                  }}
                >
                  <div className="flex gap-2">
                    <input id="gift-code" aria-label={t('Have a code?')} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={40} autoComplete="off" placeholder="DOB-XXXX-XXXX" className={`${inputClass} font-mono`} />
                    <Button type="submit" variant="secondary" busy={codeBusy} disabled={!code.trim()}>{t('Use code')}</Button>
                  </div>
                  {codeNote && <p className={`mt-2 rounded-lg px-4 py-2.5 text-sm ${codeNote.ok ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad'}`}>{codeNote.text}</p>}
                </form>
              </details>
            )}
          </div>
        </Card>
      )}

      <Card className="p-5 sm:p-6">
        <h2 className="mb-1.5 font-semibold">{t('Dobry as an app')}</h2>
        <InstallApp always />
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
