import { type User, onAuthStateChanged } from 'firebase/auth'
import { Timestamp } from 'firebase/firestore'
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import { Button, Card, EmptyState, ErrorNote, Field, Logo, PageLoader, Stat, inputClass } from '../components/ui'
import { signIn, signInWithGoogle, signOut } from '../data/account'
import {
  type BillingEntry,
  fetchAllClasses,
  fetchAllUsers,
  fetchLastActivity,
  fetchSessionsSince,
  isPlatformOwner,
  recordPayment,
  subscribeAllOrganisations,
  subscribeBilling,
  updateCustomer,
} from '../data/platform'
import { useLive } from '../hooks/useLive'
import { downloadCsv } from '../lib/csv'
import { editionForPurpose } from '../lib/editions'
import { addDays, formatDate, isoDate } from '../lib/format'
import { auth } from '../lib/auth'
import { t } from '../lib/i18n'
import { setPurpose } from '../lib/purpose'
import { PLAN_LABEL, TRIAL_DAYS, planOf } from '../lib/plan'
import type { Organisation, UserProfile } from '../lib/types'

/** The signed-in owner: just who they are, no customer account needed. */
type Me = { id: string; email: string }

const DAY = 86_400_000
const dateOf = (ms: number | null | undefined) => (ms ? formatDate(isoDate(new Date(ms))) : '—')
const editionName = (o: Organisation) => editionForPurpose(o.purpose ?? 'education')?.label ?? (o.purpose === 'events' ? 'Events' : 'Lecturers')
const money = (n: number, currency = 'MYR') => `${currency === 'USD' ? 'US$' : 'RM'}${n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`

type Status = 'early' | 'trial' | 'free' | 'pro' | 'suspended'
interface Customer {
  org: Organisation
  status: Status
  until: number | null
  lapsed: boolean
  owner?: UserProfile
  users: UserProfile[]
  people: number
  active30: number
  lastSeen: string | null
  joined: number | null
}

/**
 * Attend's own back office, separate from the customers' app: its own address (/owner), its own
 * sign-in and its own layout. Only accounts listed in platformOwners get in; they do not need to
 * belong to any customer.
 */
export default function OwnerApp() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [allowed, setAllowed] = useState<boolean | null>(null)
  useEffect(() => {
    // Plain words: none of a customer edition's word swaps apply here.
    setPurpose(undefined)
    return onAuthStateChanged(auth, (u) => {
      setUser(u)
      setAllowed(null)
      if (u) isPlatformOwner(u.uid).then(setAllowed)
    })
  }, [])
  if (user === undefined || (user && allowed === null)) return <PageLoader />
  if (!user) return <OwnerLogin />
  if (!allowed)
    return (
      <OwnerFrame>
        <div className="mx-auto max-w-sm py-20 text-center">
          <h1 className="text-xl font-semibold">{t('Not an owner account')}</h1>
          <p className="mt-2 text-muted">{t('{email} is not allowed into the Attend owner portal.', { email: user.email ?? '' })}</p>
          <Button className="mt-6" variant="secondary" onClick={() => signOut()}>{t('Log out')}</Button>
        </div>
      </OwnerFrame>
    )
  return (
    <OwnerFrame email={user.email ?? ''}>
      <Portal me={{ id: user.uid, email: user.email ?? '' }} />
    </OwnerFrame>
  )
}

/** The portal's own frame: a dark bar, so it never looks like a customer's screen. */
function OwnerFrame({ email, children }: { email?: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="bg-ink text-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <span className="flex items-center gap-3">
            <Logo className="text-white" />
            <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-semibold tracking-wide uppercase">{t('Owner')}</span>
          </span>
          {email && (
            <span className="flex items-center gap-3 text-sm">
              <span className="hidden text-white/70 sm:inline">{email}</span>
              <button type="button" onClick={() => signOut()} className="rounded-md px-2.5 py-1 font-medium text-white/90 hover:bg-white/10">{t('Log out')}</button>
            </span>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  )
}

function OwnerLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await signIn(email, password)
    } catch {
      setError(t('Wrong email or password.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <OwnerFrame>
      <div className="mx-auto max-w-sm py-12">
        <Card className="p-6">
          <h1 className="text-xl font-semibold">{t('Owner sign-in')}</h1>
          <p className="mt-1 text-sm text-muted">{t('For the people who run Attend. Customers sign in at the usual page.')}</p>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <Field label={t('Email')} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Field label={t('Password')} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <ErrorNote>{error}</ErrorNote>
            <Button type="submit" block busy={busy}>{t('Log in')}</Button>
          </form>
          <Button className="mt-3" variant="secondary" block onClick={() => signInWithGoogle().catch(() => setError(t('Google sign-in did not finish.')))}>{t('Continue with Google')}</Button>
        </Card>
      </div>
    </OwnerFrame>
  )
}

function Portal({ me }: { me: Me }) {
  const orgs = useLive<Organisation[]>((d, e) => subscribeAllOrganisations(d, e), [])
  const billing = useLive<BillingEntry[]>((d, e) => subscribeBilling(d, e), [])
  const [extra, setExtra] = useState<{ users: UserProfile[]; sessions: { organisationId: string; date: string; status: string }[]; classes: { organisationId: string; rosterCount?: number; rosterFrom?: string | null }[] } | null>(null)
  const [failed, setFailed] = useState(false)
  const [tab, setTab] = useState<'overview' | 'customers' | 'payments'>('overview')
  const [openId, setOpenId] = useState<string | null>(null)
  const today = isoDate()

  useEffect(() => {
    Promise.all([fetchAllUsers(), fetchSessionsSince(addDays(today, -29)), fetchAllClasses()]).then(
      ([users, sessions, classes]) => setExtra({ users, sessions, classes }),
      () => setFailed(true),
    )
  }, [today])

  const customers = useMemo<Customer[]>(() => {
    if (!orgs.data || !extra) return []
    return orgs.data.map((org) => {
      const p = planOf(org)
      const users = extra.users.filter((u) => u.organisationId === org.id)
      const held = extra.sessions.filter((s) => s.organisationId === org.id && s.status !== 'scheduled')
      // Workplaces count staff on their lists; teaching editions count the people who run classes.
      const people = org.purpose === 'workplace' ? extra.classes.filter((c) => c.organisationId === org.id && !c.rosterFrom).reduce((a, c) => a + (c.rosterCount ?? 0), 0) : users.length
      const created = org.createdAt
      return {
        org,
        status: (org.suspended ? 'suspended' : p.active) as Status,
        until: p.until,
        lapsed: p.lapsed,
        owner: users.find((u) => u.id === org.ownerId),
        users,
        people,
        active30: new Set(held.map((s) => s.date)).size,
        lastSeen: held.map((s) => s.date).sort().pop() ?? null,
        joined: created?.toMillis?.() ?? null,
      }
    }).sort((a, b) => (b.joined ?? 0) - (a.joined ?? 0))
  }, [orgs.data, extra])

  if (orgs.error || billing.error || failed) return <ErrorNote>{t('The owner portal could not be loaded. Check that this account is listed as an owner and that the rules are published.')}</ErrorNote>
  if (!orgs.data || !extra || !billing.data) return <PageLoader />
  const open = customers.find((c) => c.org.id === openId)

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-accent">{t('Attend owner portal')}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('Customers and subscriptions')}</h1>
        <p className="text-sm text-muted">{t('Only you can see this page. Customers never see it.')}</p>
      </div>
      <div className="inline-flex rounded-lg border border-line bg-white p-0.5 text-sm" role="tablist">
        {(['overview', 'customers', 'payments'] as const).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => setTab(v)} className={`rounded-md px-3 py-1.5 font-medium ${tab === v ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`}>
            {t(v === 'overview' ? 'Overview' : v === 'customers' ? 'Customers' : 'Payments')}
          </button>
        ))}
      </div>
      {open ? (
        <CustomerPage c={open} me={me} billing={billing.data.filter((b) => b.organisationId === open.org.id)} onBack={() => setOpenId(null)} />
      ) : tab === 'overview' ? (
        <Overview customers={customers} billing={billing.data} onOpen={setOpenId} />
      ) : tab === 'customers' ? (
        <Customers customers={customers} onOpen={setOpenId} />
      ) : (
        <Payments billing={billing.data} />
      )}
    </div>
  )
}

const STATUS_STYLE: Record<Status, string> = {
  early: 'bg-slate-100 text-slate-700',
  trial: 'bg-accent-soft text-accent',
  free: 'bg-slate-100 text-muted',
  pro: 'bg-good-soft text-good',
  suspended: 'bg-bad-soft text-bad',
}
const statusLabel = (s: Status) => (s === 'suspended' ? t('Suspended') : t(PLAN_LABEL[s]))
function Badge({ c }: { c: Customer }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_STYLE[c.status]}`}>
      {statusLabel(c.status)}
      {c.lapsed && c.status === 'free' ? ` · ${t('lapsed')}` : ''}
    </span>
  )
}

function Overview({ customers, billing, onOpen }: { customers: Customer[]; billing: BillingEntry[]; onOpen: (id: string) => void }) {
  const now = Date.now()
  const month = isoDate().slice(0, 7)
  const count = (f: (c: Customer) => boolean) => customers.filter(f).length
  const received = billing.filter((b) => b.kind === 'payment' && b.at && isoDate(b.at.toDate()).startsWith(month))
  const byCurrency = (list: BillingEntry[]) =>
    Object.entries(list.reduce<Record<string, number>>((a, b) => ({ ...a, [b.currency ?? 'MYR']: (a[b.currency ?? 'MYR'] ?? 0) + (b.amount ?? 0) }), {}))
      .map(([cur, n]) => money(n, cur))
      .join(' + ') || money(0)
  // What needs the owner's attention: trials and paid periods ending within a week, or just ended.
  const ending = customers.filter((c) => c.until && (c.status === 'trial' || c.status === 'pro') && c.until - now < 7 * DAY).sort((a, b) => (a.until ?? 0) - (b.until ?? 0))
  const lapsed = customers.filter((c) => c.lapsed && c.until && now - c.until < 30 * DAY)
  // Sign-ups per week, last eight weeks.
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = now - (7 - i) * 7 * DAY
    return { label: dateOf(end - 7 * DAY + DAY), n: customers.filter((c) => c.joined && c.joined > end - 7 * DAY && c.joined <= end).length }
  })
  const top = Math.max(1, ...weeks.map((w) => w.n))
  const editions = ['Lecturers', 'Trainers', 'Workplace'].map((e) => ({ e, n: count((c) => editionName(c.org) === e) }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label={t('Customers')} value={customers.length} />
        <Stat label={t('New in 30 days')} value={count((c) => Boolean(c.joined && now - c.joined < 30 * DAY))} />
        <Stat label={t('Active in 30 days')} value={count((c) => c.active30 > 0)} note={t('opened at least one day')} />
        <Stat label={t('Paying')} value={count((c) => c.status === 'pro')} />
        <Stat label={t('On trial')} value={count((c) => c.status === 'trial')} />
        <Stat label={t('Received this month')} value={byCurrency(received)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">{t('Needs your attention')}</h2>
          {ending.length + lapsed.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{t('No trial or paid period ends this week.')}</p>
          ) : (
            <ul className="mt-3 divide-y divide-line text-sm">
              {[...ending, ...lapsed].map((c) => (
                <li key={c.org.id} className="flex items-center justify-between gap-3 py-2">
                  <button type="button" onClick={() => onOpen(c.org.id)} className="min-w-0 truncate text-left font-medium text-accent hover:underline">{c.org.name}</button>
                  <span className="shrink-0 text-xs text-muted">
                    <Badge c={c} /> {c.lapsed ? t('ended {date}', { date: dateOf(c.until) }) : t('ends {date}', { date: dateOf(c.until) })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">{t('Sign-ups per week')}</h2>
          <div className="mt-4 flex h-28 items-end gap-2">
            {weeks.map((w) => (
              <div key={w.label} className="flex flex-1 flex-col items-center gap-1" title={`${w.label}: ${w.n}`}>
                <span className="tabular text-xs text-muted">{w.n || ''}</span>
                <span className="w-full max-w-8 rounded-t bg-accent" style={{ height: `${(w.n / top) * 80}px`, minHeight: w.n ? 4 : 1, opacity: w.n ? 1 : 0.25 }} />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">{t('Last eight weeks, oldest on the left.')}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {editions.map(({ e, n }) => (
              <span key={e} className="rounded-md bg-canvas px-2.5 py-1">{e} <span className="font-semibold">{n}</span></span>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

function Customers({ customers, onOpen }: { customers: Customer[]; onOpen: (id: string) => void }) {
  const [q, setQ] = useState('')
  const [edition, setEdition] = useState('')
  const [status, setStatus] = useState('')
  const term = q.trim().toLowerCase()
  const shown = customers.filter(
    (c) =>
      (!term || c.org.name.toLowerCase().includes(term) || c.owner?.email.toLowerCase().includes(term) || c.owner?.name.toLowerCase().includes(term)) &&
      (!edition || editionName(c.org) === edition) &&
      (!status || c.status === status),
  )
  const exportCsv = () =>
    downloadCsv(
      `attend-customers-${isoDate()}.csv`,
      [['Company', 'Edition', 'Contact', 'Email', 'Joined', 'People', 'Days opened (30 days)', 'Last activity', 'Plan', 'Until'], ...shown.map((c) => [c.org.name, editionName(c.org), c.owner?.name ?? '', c.owner?.email ?? '', dateOf(c.joined), c.people, c.active30, c.lastSeen ?? '', statusLabel(c.status), dateOf(c.until)])]
        .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\r\n'),
      true,
    )
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search company, name or email')} className={`${inputClass} max-w-xs`} />
        <select value={edition} onChange={(e) => setEdition(e.target.value)} className={`${inputClass} w-auto`}>
          <option value="">{t('All editions')}</option>
          {['Lecturers', 'Trainers', 'Workplace'].map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} w-auto`}>
          <option value="">{t('Any plan')}</option>
          {(['early', 'trial', 'pro', 'free', 'suspended'] as Status[]).map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
        <Button variant="secondary" onClick={exportCsv} disabled={shown.length === 0}>{t('Export for Excel')}</Button>
      </div>
      {shown.length === 0 ? (
        <EmptyState title={t('No customers match')} text={t('Try another search or filter.')} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-muted">
              <tr>
                {['Company', 'Edition', 'Contact', 'Joined', 'People', 'Last activity', 'Plan'].map((h) => (
                  <th key={h} className="px-3 py-2.5 font-medium first:pl-5 last:pr-5">{t(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((c) => (
                <tr key={c.org.id} className="cursor-pointer hover:bg-canvas/60" onClick={() => onOpen(c.org.id)}>
                  <td className="py-2.5 pr-3 pl-5 font-medium text-accent">{c.org.name}</td>
                  <td className="px-3 py-2.5">{editionName(c.org)}</td>
                  <td className="px-3 py-2.5">
                    <span className="block">{c.owner?.name ?? '—'}</span>
                    <span className="block text-xs text-muted">{c.owner?.email}</span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{dateOf(c.joined)}</td>
                  <td className="tabular px-3 py-2.5">{c.people}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {c.lastSeen ? formatDate(c.lastSeen) : <span className="text-muted">{t('over 30 days ago')}</span>}
                    {c.active30 > 0 && <span className="block text-xs text-muted">{t('{n} days in 30', { n: c.active30 })}</span>}
                  </td>
                  <td className="py-2.5 pr-5 pl-3">
                    <Badge c={c} />
                    {c.until && <span className="block text-xs text-muted">{c.lapsed ? t('ended {date}', { date: dateOf(c.until) }) : t('until {date}', { date: dateOf(c.until) })}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

function CustomerPage({ c, me, billing, onBack }: { c: Customer; me: Me; billing: BillingEntry[]; onBack: () => void }) {
  const org = c.org
  const workplace = org.purpose === 'workplace'
  const [lastSeen, setLastSeen] = useState<string | null | undefined>(c.lastSeen ?? undefined)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  // Plan form.
  const [plan, setPlan] = useState<'early' | 'trial' | 'free' | 'pro'>(org.plan ?? 'early')
  const [until, setUntil] = useState(org.paidUntil ? isoDate(org.paidUntil.toDate()) : addDays(isoDate(), 30))
  const [seats, setSeats] = useState(String(org.seats ?? (workplace ? 20 : 0)))
  // Payment form.
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<'MYR' | 'USD'>('MYR')
  const [method, setMethod] = useState('Bank transfer')
  const [reference, setReference] = useState('')
  // A renewal runs on from the current paid period (or from today when there is none).
  const paidMs = org.paidUntil?.toMillis() ?? 0
  const renewFrom = paidMs > Date.now() ? isoDate(new Date(paidMs)) : isoDate()
  const [extend, setExtend] = useState(true)
  const [extendTo, setExtendTo] = useState(addDays(renewFrom, 30))
  const [note, setNote] = useState(org.ownerNote ?? '')
  // Keep the forms in step when the customer changes (after a save here, or elsewhere).
  useEffect(() => {
    setExtendTo(addDays(renewFrom, 30))
    if (paidMs) setUntil(isoDate(new Date(paidMs)))
  }, [paidMs, renewFrom])
  const shortens = (date: string) => paidMs > Date.now() && new Date(`${date}T23:59:59`).getTime() < paidMs

  useEffect(() => {
    if (!c.lastSeen) fetchLastActivity(org.id).then(setLastSeen, () => setLastSeen(null))
  }, [org.id, c.lastSeen])

  const run = async (label: string, fn: () => Promise<void>, ok: string) => {
    setBusy(label)
    setError('')
    setDone('')
    try {
      await fn()
      setDone(ok)
    } catch {
      setError(t('That did not save. Check your connection and try again.'))
    } finally {
      setBusy('')
    }
  }
  const endOfDay = (d: string) => Timestamp.fromDate(new Date(`${d}T23:59:59`))

  const savePlan = () => {
    if (plan === 'pro' && shortens(until) && !window.confirm(t('This ends their paid period earlier, on {date} instead of {old}. Continue?', { date: formatDate(until), old: dateOf(paidMs) }))) return
    const patch =
      plan === 'pro'
        ? { plan, paidUntil: endOfDay(until), ...(workplace ? { seats: Math.max(0, Math.floor(Number(seats) || 0)) } : {}) }
        : plan === 'trial'
          ? { plan, trialStarted: org.plan === 'trial' && org.trialStarted ? org.trialStarted : Timestamp.now() }
          : { plan }
    const words = `${t('Plan')}: ${statusLabel(c.status)} → ${t(PLAN_LABEL[plan])}${plan === 'pro' ? ` ${t('until {date}', { date: formatDate(until) })}${workplace ? `, ${seats} ${t('staff')}` : ''}` : ''}`
    return run('plan', () => updateCustomer(org, patch, me.id, words), t('Plan saved.'))
  }
  const extendTrial = (days: number) => {
    const base = org.plan === 'trial' && org.trialStarted ? org.trialStarted.toMillis() : Date.now() - TRIAL_DAYS * DAY
    // The trial runs TRIAL_DAYS from trialStarted, so moving the start later lengthens it.
    const start = Timestamp.fromMillis(Math.max(base, Date.now() - TRIAL_DAYS * DAY) + days * DAY)
    return run('trial', () => updateCustomer(org, { plan: 'trial', trialStarted: start }, me.id, t('Trial extended by {n} days', { n: days })), t('Trial extended.'))
  }
  const pay = () => {
    const n = Number(amount)
    if (!(n > 0)) return setError(t('Enter the amount received.'))
    if (extend && shortens(extendTo) && !window.confirm(t('This ends their paid period earlier, on {date} instead of {old}. Continue?', { date: formatDate(extendTo), old: dateOf(paidMs) }))) return
    return run(
      'pay',
      () => recordPayment(org, { amount: n, currency, method, note: reference.trim() }, me.id, extend && extendTo ? { paidUntil: endOfDay(extendTo), ...(workplace ? { seats: Math.max(0, Math.floor(Number(seats) || 0)) } : {}) } : undefined),
      t('Payment recorded.'),
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <button type="button" onClick={onBack} className="text-sm font-medium text-accent hover:underline">← {t('All customers')}</button>
          <h2 className="text-xl font-semibold tracking-tight">{org.name}</h2>
          <p className="text-sm text-muted">
            {editionName(org)} · {t('joined {date}', { date: dateOf(c.joined) })} · <Badge c={c} />
            {c.until && c.status !== 'suspended' && ` ${c.lapsed ? t('ended {date}', { date: dateOf(c.until) }) : t('until {date}', { date: dateOf(c.until) })}`}
          </p>
        </div>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {done && <p className="rounded-lg bg-good-soft px-4 py-2 text-sm text-good">{done}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h3 className="font-semibold">{t('Contact and usage')}</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div><dt className="text-xs text-muted">{t('Account owner')}</dt><dd>{c.owner?.name ?? '—'} <span className="block text-muted">{c.owner?.email}</span></dd></div>
            <div><dt className="text-xs text-muted">{workplace ? t('Staff on lists') : t('Accounts')}</dt><dd className="tabular">{c.people}</dd></div>
            <div><dt className="text-xs text-muted">{t('Days opened in the last 30 days')}</dt><dd className="tabular">{c.active30}</dd></div>
            <div><dt className="text-xs text-muted">{t('Last activity')}</dt><dd>{lastSeen === undefined ? '…' : lastSeen ? formatDate(lastSeen) : t('Never')}</dd></div>
          </dl>
          <h4 className="mt-4 text-xs font-semibold tracking-wide text-muted uppercase">{t('People with an account')} · {c.users.length}</h4>
          <ul className="mt-1.5 space-y-1 text-sm">
            {c.users.map((u) => (
              <li key={u.id} className="flex justify-between gap-2">
                <span className="min-w-0 truncate">{u.name} <span className="text-muted">· {u.email}</span></span>
                <span className="shrink-0 text-xs text-muted">{u.role === 'admin' ? t('Admin') : t('Manager')}{u.status !== 'active' ? ` · ${t('disabled')}` : ''}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="space-y-3 p-5">
          <h3 className="font-semibold">{t('Plan')}</h3>
          <select value={plan} onChange={(e) => setPlan(e.target.value as typeof plan)} className={inputClass}>
            {(['early', 'trial', 'free', 'pro'] as const).map((p) => <option key={p} value={p}>{t(PLAN_LABEL[p])}</option>)}
          </select>
          {plan === 'pro' && (
            <label className="block text-xs font-medium text-muted">
              {t('Paid until')}
              <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={`${inputClass} mt-1`} />
            </label>
          )}
          {plan === 'pro' && workplace && (
            <label className="block text-xs font-medium text-muted">
              {t('Staff covered')}
              <select value={seats} onChange={(e) => setSeats(e.target.value)} className={`${inputClass} mt-1`}>
                {['20', '50', '100', '200', '500'].concat(['20', '50', '100', '200', '500'].includes(seats) ? [] : [seats]).map((s) => <option key={s} value={s}>{t('Up to {n} staff', { n: s })}</option>)}
              </select>
            </label>
          )}
          {plan === 'trial' && <p className="text-xs text-muted">{t('A 14-day trial. Use the buttons below to give more days.')}</p>}
          <Button busy={busy === 'plan'} onClick={savePlan}>{t('Save plan')}</Button>
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            <Button variant="secondary" busy={busy === 'trial'} onClick={() => extendTrial(7)}>{t('Trial +7 days')}</Button>
            <Button variant="secondary" busy={busy === 'trial'} onClick={() => extendTrial(14)}>{t('Trial +14 days')}</Button>
          </div>
          <div className="border-t border-line pt-3">
            {org.suspended ? (
              <Button variant="secondary" busy={busy === 'suspend'} onClick={() => run('suspend', () => updateCustomer(org, { suspended: false }, me.id, t('Account restored')), t('Account restored.'))}>{t('Restore account')}</Button>
            ) : (
              <Button
                variant="danger"
                busy={busy === 'suspend'}
                onClick={() => window.confirm(t('Suspend {name}? Their people will not be able to use Attend until you restore it. Nothing is deleted.', { name: org.name })) && run('suspend', () => updateCustomer(org, { suspended: true }, me.id, t('Account suspended')), t('Account suspended.'))}
              >
                {t('Suspend account')}
              </Button>
            )}
          </div>
        </Card>

        <Card className="space-y-3 p-5">
          <h3 className="font-semibold">{t('Record a payment')}</h3>
          <p className="text-xs text-muted">{t('For money received outside the app, until online payment is connected.')}</p>
          <div className="flex gap-2">
            <select value={currency} onChange={(e) => setCurrency(e.target.value as 'MYR' | 'USD')} className={`${inputClass} w-24`}>
              <option value="MYR">RM</option>
              <option value="USD">US$</option>
            </select>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t('Amount')} className={inputClass} />
          </div>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputClass}>
            {['Bank transfer', 'DuitNow', 'Card', 'Cash', 'Other'].map((m) => <option key={m} value={m}>{t(m)}</option>)}
          </select>
          <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} placeholder={t('Reference or note (optional)')} className={inputClass} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={extend} onChange={(e) => setExtend(e.target.checked)} className="size-4 accent-accent" />
            {t('And make them Pro until')}
          </label>
          {extend && (
            <>
              <input type="date" value={extendTo} onChange={(e) => setExtendTo(e.target.value)} className={inputClass} aria-label={t('And make them Pro until')} />
              {paidMs > Date.now() && <p className="text-xs text-muted">{t('Now paid until {date}.', { date: dateOf(paidMs) })}</p>}
            </>
          )}
          <Button busy={busy === 'pay'} onClick={pay}>{t('Record payment')}</Button>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <h3 className="font-semibold">{t('Private note')}</h3>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={4} placeholder={t('Only you see this. For example: who to call, what was agreed.')} className={inputClass} />
          <Button variant="secondary" busy={busy === 'note'} disabled={note === (org.ownerNote ?? '')} onClick={() => run('note', () => updateCustomer(org, { ownerNote: note }, me.id, ''), t('Note saved.'))}>{t('Save note')}</Button>
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold">{t('History')}</h3>
          {billing.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{t('No payments or changes yet.')}</p>
          ) : (
            <ul className="mt-2 divide-y divide-line text-sm">
              {billing.map((b) => (
                <li key={b.id} className="flex justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block">{b.kind === 'payment' ? `${t('Payment')} ${money(b.amount ?? 0, b.currency)} · ${t(b.method ?? '')}` : b.note}</span>
                    {b.kind === 'payment' && b.note && <span className="block text-xs text-muted">{b.note}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted">{b.at ? dateOf(b.at.toMillis()) : '…'}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function Payments({ billing }: { billing: BillingEntry[] }) {
  const payments = billing.filter((b) => b.kind === 'payment')
  const months = [...new Set(payments.map((b) => (b.at ? isoDate(b.at.toDate()).slice(0, 7) : isoDate().slice(0, 7))))].sort().reverse()
  const total = (list: BillingEntry[]) =>
    Object.entries(list.reduce<Record<string, number>>((a, b) => ({ ...a, [b.currency ?? 'MYR']: (a[b.currency ?? 'MYR'] ?? 0) + (b.amount ?? 0) }), {}))
      .map(([cur, n]) => money(n, cur))
      .join(' + ') || money(0)
  const exportCsv = () =>
    downloadCsv(
      `attend-payments-${isoDate()}.csv`,
      [['Date', 'Company', 'Amount', 'Currency', 'Method', 'Reference'], ...payments.map((b) => [b.at ? isoDate(b.at.toDate()) : '', b.organisationName ?? b.organisationId, b.amount ?? 0, b.currency ?? 'MYR', b.method ?? '', b.note ?? ''])]
        .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\r\n'),
      true,
    )
  if (payments.length === 0) return <EmptyState title={t('No payments recorded yet')} text={t('Open a customer and use Record a payment when money comes in.')} />
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{t('Everything received, newest first. Entries cannot be edited or deleted, so the book stays honest.')}</p>
        <Button variant="secondary" onClick={exportCsv}>{t('Export for Excel')}</Button>
      </div>
      {months.map((m) => {
        const list = payments.filter((b) => (b.at ? isoDate(b.at.toDate()).slice(0, 7) : isoDate().slice(0, 7)) === m)
        return (
          <Card key={m} className="overflow-hidden">
            <div className="flex justify-between bg-slate-50 px-5 py-2.5 text-sm font-semibold">
              <span>{new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
              <span className="tabular">{total(list)}</span>
            </div>
            <ul className="divide-y divide-line text-sm">
              {list.map((b) => (
                <li key={b.id} className="flex flex-wrap justify-between gap-x-3 px-5 py-2.5">
                  <span>
                    <span className="font-medium">{b.organisationName ?? b.organisationId}</span>
                    <span className="text-muted"> · {t(b.method ?? '')}{b.note ? ` · ${b.note}` : ''}</span>
                  </span>
                  <span className="tabular">
                    {money(b.amount ?? 0, b.currency)} <span className="text-xs text-muted">· {b.at ? dateOf(b.at.toMillis()) : '…'}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )
      })}
    </div>
  )
}
