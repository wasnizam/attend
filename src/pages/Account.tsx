import { MAX_SEATS, monthPrice, offersYear, toPlanCard, useCatalog, yearPrice } from '../lib/pricing'
import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, ErrorNote, friendlyError, inputClass } from '../components/ui'
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

/** One part of the page: what it is about on top, its settings as rows beneath. */
function Section({ id, title, text, children }: { id: string; title: string; text?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <Card className="overflow-hidden">
        <div className="border-b border-line bg-slate-50/60 px-5 py-4 sm:px-6">
          <h2 className="font-semibold">{title}</h2>
          {text && <p className="mt-0.5 text-sm text-muted">{text}</p>}
        </div>
        <div className="px-5 sm:px-6">{children}</div>
      </Card>
    </section>
  )
}

/** One setting: its name and a word of help on the left, the control on the right. */
function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 border-t border-line py-4 first:border-0 md:grid-cols-[13rem_1fr] md:gap-6">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-muted">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** What happened after saving, under the control it belongs to. */
function Notes({ error, done }: { error: string; done: string }) {
  return (
    <div className="mt-2 space-y-2 empty:hidden">
      <ErrorNote>{error}</ErrorNote>
      <Saved text={done} />
    </div>
  )
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

  const work = profile.role === 'admin' && org && getPurpose() === 'workplace' ? org : null
  const initials = profile.name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  const sections: [string, string][] = [
    ['profile', 'Profile'],
    ['security', 'Sign-in'],
    ['organisation', 'Organisation'],
    ...(work ? ([['rules', 'Work rules']] as [string, string][]) : []),
    ...(edition ? ([['plan', 'Plan and billing']] as [string, string][]) : []),
    ['app', 'App and language'],
  ]

  return (
    <div className="mx-auto max-w-4xl">
      {/* Who is signed in: the first thing to check when something looks wrong on another device. */}
      <header className="flex flex-wrap items-center gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-night font-display text-xl font-bold text-sun">{initials || '·'}</span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight break-words sm:text-3xl">{profile.name}</h1>
          <p className="text-sm break-all text-muted">{profile.email}</p>
        </div>
        <div className="flex basis-full flex-wrap items-center gap-2 text-xs font-semibold md:basis-auto">
          {org?.name && <span className="max-w-full truncate rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{org.name}</span>}
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{profile.role === 'admin' ? t('Admin') : t('Lecturer')}</span>
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-accent">{t(myPlan?.name ?? PLAN_LABEL[plan])}</span>
        </div>
      </header>

      <div className="mt-6 gap-8 md:grid md:grid-cols-[11rem_1fr]">
        <nav aria-label={t('Account')} className="-mx-4 mb-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden text-sm font-medium md:sticky md:top-6 md:mx-0 md:mb-0 md:block md:space-y-0.5 md:self-start md:overflow-visible md:px-0">
          {sections.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="block shrink-0 rounded-lg px-3 py-2 whitespace-nowrap text-slate-600 hover:bg-slate-100 hover:text-ink">
              {t(label)}
            </a>
          ))}
        </nav>

        <div className="min-w-0 space-y-5">
          <Section id="profile" title={t('Profile')} text={t('Your name as it appears on sessions, reports and letters.')}>
            <Row label={t('Your name')}>
              <form
                className="flex flex-col gap-2 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault()
                  nameSave.run(() => changeName(name), t('Name saved.'))
                }}
              >
                <input aria-label={t('Your name')} required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
                <Button type="submit" variant="secondary" busy={nameSave.busy} disabled={!name.trim() || name.trim() === profile.name} className="shrink-0">
                  {t('Save')}
                </Button>
              </form>
              <Notes error={nameSave.error} done={nameSave.done} />
            </Row>
            <Row label={t('Email')} hint={t('You log in with this. It cannot be changed here.')}>
              <p className="flex flex-wrap items-center gap-2 break-all">
                {profile.email}
                {user?.emailVerified ? (
                  <span className="rounded-full bg-good-soft px-2 py-0.5 text-xs font-semibold text-good">{t('Verified')}</span>
                ) : usesPassword ? (
                  <span className="rounded-full bg-[#fff4d6] px-2 py-0.5 text-xs font-semibold text-[#8a5a00]">{t('Not verified yet.')}</span>
                ) : null}
              </p>
              {usesPassword && user && !user.emailVerified && (
                <button type="button" disabled={verifySave.busy} className="mt-1.5 text-sm font-medium text-accent" onClick={() => verifySave.run(resendVerification, t('Verification email sent. Check your inbox.'))}>
                  {t('Send the verification email again')}
                </button>
              )}
              <Notes error={verifySave.error} done={verifySave.done} />
            </Row>
          </Section>

          <Section id="security" title={t('Sign-in')} text={usesPassword ? t('Change the password you log in with.') : t('You log in with Google, so there is no Dobry password to keep.')}>
            {usesPassword ? (
              <form onSubmit={submitPassword}>
                <Row label={t('Current password')}>
                  <input aria-label={t('Current password')} type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
                </Row>
                <Row label={t('New password')} hint={t('6+ characters')}>
                  <input aria-label={t('New password')} type="password" autoComplete="new-password" required minLength={6} value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} />
                  <Notes error={passwordSave.error} done={passwordSave.done} />
                  <Button type="submit" variant="secondary" busy={passwordSave.busy} className="mt-3">
                    {t('Change password')}
                  </Button>
                </Row>
              </form>
            ) : (
              <Row label={t('Signed in with')}>
                <p className="font-medium">Google</p>
              </Row>
            )}
          </Section>

          <Section id="organisation" title={t('Organisation')} text={profile.role === 'admin' ? t('The name people see when they join you, and on your reports.') : undefined}>
            <Row label={t('Organisation name')}>
              {profile.role === 'admin' && org ? (
                <form
                  className="flex flex-col gap-2 sm:flex-row"
                  onSubmit={(e) => {
                    e.preventDefault()
                    orgSave.run(async () => {
                      await renameOrganisation(org, orgName)
                      setOrg({ ...org, name: orgName.trim() })
                    }, t('Organisation name saved.'))
                  }}
                >
                  <input aria-label={t('Organisation name')} required maxLength={100} value={orgName} onChange={(e) => setOrgName(e.target.value)} className={inputClass} />
                  <Button type="submit" variant="secondary" busy={orgSave.busy} disabled={!orgName.trim() || orgName.trim() === org.name} className="shrink-0">
                    {t('Save')}
                  </Button>
                </form>
              ) : (
                <p>{org?.name ?? '—'}</p>
              )}
              <Notes error={orgSave.error} done={orgSave.done} />
            </Row>
            <Row label={t('Your role')}>
              <p className="font-medium">{profile.role === 'admin' ? t('Admin') : t('Lecturer')}</p>
            </Row>
          </Section>

          {work && (
            <Section id="rules" title={t('Work rules')} text={t('How your company clocks in and how hours are counted. Each change is saved as you make it.')}>
              <Row label={t('We work in shifts', undefined, true)} hint={t('Adds several shifts, people who rotate between them, and a weekly shift plan. Leave it off for ordinary office hours.', undefined, true)}>
                <label className="inline-flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={Boolean(work.shifts) && allows('shifts')}
                    disabled={!allows('shifts')}
                    onChange={(e) => {
                      const on = e.target.checked
                      orgSave.run(async () => {
                        await setShifts(work.id, on)
                        setOrg({ ...work, shifts: on })
                      }, '')
                    }}
                    className="peer sr-only"
                  />
                  <span aria-hidden className="relative h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-accent peer-focus-visible:ring-4 peer-focus-visible:ring-accent/20 peer-disabled:opacity-50 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
                  <span className="text-sm">{Boolean(work.shifts) && allows('shifts') ? t('On') : t('Off')}</span>
                </label>
                {!allows('shifts') && <UpgradeNote what={t('Night, rotating and planned shifts are part of the paid plans.')} className="mt-2" />}
              </Row>
              <Row label={t('A clock-in from a phone that is not their own')} hint={t('Each person’s first clock-in registers their phone. A new phone can be approved in one tap on the day’s list. Applies to days opened from now on.')}>
                <select
                  aria-label={t('A clock-in from a phone that is not their own')}
                  value={allows('phoneCheck') ? (work.phoneCheck ?? 'flag') : 'flag'}
                  disabled={!allows('phoneCheck')}
                  onChange={(e) => {
                    const value = e.target.value as 'flag' | 'block'
                    orgSave.run(async () => {
                      await setPhoneCheckFor(work.id, value)
                      setOrg({ ...work, phoneCheck: value })
                    }, '')
                  }}
                  className={inputClass}
                >
                  <option value="flag">{t('Allow it, and flag it for me')}</option>
                  <option value="block">{t('Refuse it until I approve the phone')}</option>
                </select>
                {!allows('phoneCheck') && <UpgradeNote what={t('Refusing a clock-in from someone else’s phone is part of the paid plans.')} className="mt-2" />}
              </Row>
              <Row label={t('Overtime on a normal day starts')} hint={t('With a full day, someone who comes in 45 minutes late and stays 30 minutes late has no overtime. Rest days and public holidays are always counted apart.')}>
                <select
                  aria-label={t('Overtime on a normal day starts')}
                  value={work.otRule ?? 'fullDay'}
                  onChange={(e) => {
                    const value = e.target.value as 'fullDay' | 'end'
                    orgSave.run(async () => {
                      await setOrgSetting(work.id, 'otRule', value)
                      setOrg({ ...work, otRule: value })
                    }, '')
                  }}
                  className={inputClass}
                >
                  <option value="fullDay">{t('After a full day’s normal hours')}</option>
                  <option value="end">{t('Any time after the end time')}</option>
                </select>
              </Row>
              <Row label={t('Company time zone')} hint={t('Reports warn when they are opened on a computer set to another time zone, because late and overtime minutes would shift.')}>
                <select
                  aria-label={t('Company time zone')}
                  value={work.timezone ?? browserZone}
                  onChange={(e) => {
                    const value = e.target.value
                    orgSave.run(async () => {
                      await setOrgSetting(work.id, 'timezone', value)
                      setOrg({ ...work, timezone: value })
                    }, '')
                  }}
                  className={inputClass}
                >
                  {[...new Set([work.timezone ?? browserZone, browserZone, ...ZONES])].map((z) => (
                    <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </Row>
            </Section>
          )}

          <section id="plan" className="scroll-mt-24 empty:hidden">
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
          </section>

          <Section id="app" title={t('App and language')}>
            <Row label={t('Dobry as an app')}>
              <InstallApp always />
            </Row>
            <Row label={t('Language')}>
              <select aria-label={t('Language')} value={getLang()} onChange={(e) => setLang(e.target.value as 'en' | 'ms')} className={inputClass}>
                {LANGS.map((l) => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </select>
            </Row>
          </Section>

          <div className="flex justify-end">
            <Button
              variant="secondary"
              onClick={async () => {
                await signOut()
                navigate('/')
              }}
            >
              {t('Log out')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
