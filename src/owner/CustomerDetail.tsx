import { type FormEvent, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, Card, EmptyState, inputClass } from '../components/ui'
import { type Price, Timestamp, addNote, addTask, can, fetchLastActivity, monthly, resetPassword, setTaskDone, setUserStatus, updateCustomer, voidInvoice } from '../data/platform'
import { addDays, formatDate, isoDate } from '../lib/format'
import { t } from '../lib/i18n'
import { downloadInvoicePdf } from '../lib/invoicePdf'
import { PLAN_LABEL, TRIAL_DAYS } from '../lib/plan'
import { DAY, dateOf, editionName, money, statusLabel, useOwner } from './context'
import { InvoiceForm, PaymentForm } from './forms'
import { HealthBadge, Kpi, Section, StatusBadge, Tabs, planUntil, td, th, useAction } from './ui'

type Tab = 'overview' | 'subscription' | 'billing' | 'users' | 'activity' | 'notes' | 'audit'

export default function CustomerDetail() {
  const { id } = useParams()
  const o = useOwner()
  const c = o.customers.find((x) => x.org.id === id)
  const [tab, setTab] = useState<Tab>('overview')
  if (!c) return <EmptyState title={t('Customer not found')} text={t('It may have been removed.')} />
  const org = c.org
  const notes = o.notes.filter((n) => n.organisationId === org.id)
  const tasks = o.tasks.filter((x) => x.organisationId === org.id)
  const money_ = o.billing.filter((b) => b.organisationId === org.id)
  const invoices = o.invoices.filter((i) => i.organisationId === org.id)
  const audit = o.audit.filter((a) => a.organisationId === org.id)
  return (
    <>
      <div>
        <Link to="/owner/customers" className="text-sm font-medium text-accent hover:underline">← {t('Customers')}</Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
          <StatusBadge c={c} />
          <HealthBadge c={c} />
        </div>
        <p className="mt-0.5 text-sm text-muted">
          {editionName(org)} · {t('joined {date}', { date: dateOf(c.joined) })} · {t('ID')} <span className="font-mono text-xs">{org.id}</span>
          {planUntil(c) && ` · ${planUntil(c)}`}
        </p>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          ['overview', t('Overview')],
          ['subscription', t('Subscription')],
          ['billing', t('Billing'), invoices.length + money_.filter((b) => b.kind !== 'change').length],
          ['users', t('Users'), c.users.length],
          ['activity', t('Activity')],
          ['notes', t('Notes & tasks'), notes.length + tasks.filter((x) => !x.done).length],
          ...(can(o.me.role, 'audit') ? ([['audit', t('Audit'), audit.length]] as [Tab, string, number][]) : []),
        ]}
      />
      {tab === 'overview' && <Overview c={c} />}
      {tab === 'subscription' && <Subscription c={c} />}
      {tab === 'billing' && <BillingTab c={c} />}
      {tab === 'users' && <UsersTab c={c} />}
      {tab === 'activity' && <Activity c={c} />}
      {tab === 'notes' && <NotesTab c={c} />}
      {tab === 'audit' && (
        <Card className="overflow-x-auto">
          {audit.length === 0 ? (
            <p className="p-5 text-sm text-muted">{t('No changes recorded yet.')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50"><tr>{['When', 'Who', 'What'].map((h) => <th key={h} className={th}>{t(h)}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {audit.map((a) => (
                  <tr key={a.id}><td className={`${td} whitespace-nowrap text-muted`}>{a.at ? a.at.toDate().toLocaleString() : '…'}</td><td className={td}>{a.actorEmail}</td><td className={td}>{a.detail}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </>
  )
}

type C = ReturnType<typeof useOwner>['customers'][number]

function Overview({ c }: { c: C }) {
  const { team, me, staffName } = useOwner()
  const org = c.org
  const { busy, run, messages } = useAction()
  const [tagText, setTagText] = useState('')
  const [lastSeen, setLastSeen] = useState<string | null | undefined>(c.lastSeen ?? undefined)
  useEffect(() => {
    if (!c.lastSeen) fetchLastActivity(org.id).then(setLastSeen, () => setLastSeen(null))
  }, [org.id, c.lastSeen])
  const support = can(me.role, 'support')
  const tags = org.tags ?? []
  const saveTags = (next: string[]) => run('tags', () => updateCustomer(org, { tags: next }, me, 'tags', `Tags: ${next.join(', ') || 'none'}`), t('Tags saved.'))
  return (
    <>
      {messages}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={org.purpose === 'workplace' ? t('Staff on lists') : t('Accounts')} value={c.people} note={org.purpose === 'workplace' && org.seats ? t('plan covers {n}', { n: org.seats }) : undefined} tone={org.seats && c.people > org.seats ? 'warn' : undefined} />
        <Kpi label={t('Days used in 30 days')} value={c.active30} note={lastSeen === undefined ? '' : lastSeen ? t('last {date}', { date: formatDate(lastSeen) }) : t('never used')} />
        <Kpi label={t('Revenue / month')} value={c.mrr ? money(Math.round(c.mrr * 100) / 100, org.price?.currency) : '—'} note={org.price ? `${money(org.price.amount, org.price.currency)} ${t(org.price.cycle === 'month' ? 'a month' : org.price.cycle === 'semester' ? 'a semester' : 'a year')}` : t('no price set')} />
        <Kpi label={t('Health')} value={<HealthBadge c={c} />} note={c.healthWhy} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('Contact')}>
          <dl className="space-y-2 text-sm">
            <div><dt className="text-xs text-muted">{t('Account owner')}</dt><dd>{c.owner?.name ?? '—'} · <a className="text-accent" href={`mailto:${c.owner?.email}`}>{c.owner?.email}</a></dd></div>
            <div><dt className="text-xs text-muted">{t('Accounts')}</dt><dd>{t('{n} admins, {m} managers', { n: c.users.filter((u) => u.role === 'admin').length, m: c.users.filter((u) => u.role !== 'admin').length })}</dd></div>
          </dl>
        </Section>
        <Section title={t('Account management')}>
          <label className="block text-xs font-medium text-muted">
            {t('Account manager')}
            <select
              disabled={!support || busy === 'am'}
              value={org.accountManager ?? ''}
              onChange={(e) => run('am', () => updateCustomer(org, { accountManager: e.target.value }, me, 'account manager', `Account manager: ${e.target.value ? staffName(e.target.value) : 'none'}`), t('Account manager saved.'))}
              className={`${inputClass} mt-1`}
            >
              <option value="">{t('Nobody yet')}</option>
              {team.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
            </select>
          </label>
          <p className="mt-3 text-xs font-medium text-muted">{t('Tags')}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {tags.map((x) => (
              <span key={x} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs">
                {x}
                {support && <button type="button" onClick={() => saveTags(tags.filter((y) => y !== x))} className="text-muted hover:text-bad" aria-label={t('Remove tag')}>×</button>}
              </span>
            ))}
            {tags.length === 0 && <span className="text-xs text-muted">{t('No tags')}</span>}
          </div>
          {support && (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const v = tagText.trim().toLowerCase()
                if (v && !tags.includes(v)) saveTags([...tags, v].slice(0, 20))
                setTagText('')
              }}
            >
              <input value={tagText} onChange={(e) => setTagText(e.target.value)} maxLength={30} placeholder={t('Add a tag, e.g. school, vip, reseller')} className={inputClass} />
              <Button type="submit" variant="secondary" busy={busy === 'tags'}>{t('Add')}</Button>
            </form>
          )}
        </Section>
      </div>
    </>
  )
}

function Subscription({ c }: { c: C }) {
  const { me } = useOwner()
  const org = c.org
  const workplace = org.purpose === 'workplace'
  const { busy, run, messages } = useAction()
  const moneyOk = can(me.role, 'money')
  const paidMs = org.paidUntil?.toMillis() ?? 0
  const [plan, setPlan] = useState<'early' | 'trial' | 'free' | 'pro'>(org.plan ?? 'early')
  const [until, setUntil] = useState(paidMs ? isoDate(new Date(paidMs)) : addDays(isoDate(), 30))
  const [seats, setSeats] = useState(String(org.seats ?? (workplace ? 20 : 0)))
  const [amount, setAmount] = useState(org.price ? String(org.price.amount) : '')
  const [currency, setCurrency] = useState<Price['currency']>(org.price?.currency ?? 'MYR')
  const [cycle, setCycle] = useState<Price['cycle']>(org.price?.cycle ?? (org.purpose === 'education' ? 'semester' : 'month'))
  useEffect(() => {
    if (paidMs) setUntil(isoDate(new Date(paidMs)))
  }, [paidMs])
  const save = (e: FormEvent) => {
    e.preventDefault()
    if (plan === 'pro' && paidMs > Date.now() && new Date(`${until}T23:59:59`).getTime() < paidMs && !window.confirm(t('This ends their paid period earlier, on {date} instead of {old}. Continue?', { date: formatDate(until), old: dateOf(paidMs) }))) return
    const price: Price | undefined = Number(amount) > 0 ? { amount: Number(amount), currency, cycle } : undefined
    const patch =
      plan === 'pro'
        ? { plan, paidUntil: Timestamp.fromDate(new Date(`${until}T23:59:59`)), ...(workplace ? { seats: Math.max(0, Math.floor(Number(seats) || 0)) } : {}), ...(price ? { price } : {}) }
        : plan === 'trial'
          ? { plan, trialStarted: org.plan === 'trial' && org.trialStarted ? org.trialStarted : Timestamp.now(), ...(price ? { price } : {}) }
          : { plan, ...(price ? { price } : {}) }
    const words = `${statusLabel(c.status)} → ${PLAN_LABEL[plan]}${plan === 'pro' ? ` until ${until}${workplace ? `, ${seats} staff` : ''}` : ''}${price ? `, ${currency} ${price.amount} per ${cycle}` : ''}`
    run('plan', () => updateCustomer(org, patch, me, 'plan', words), t('Subscription saved.'))
  }
  const extendTrial = (days: number) => {
    const base = org.plan === 'trial' && org.trialStarted ? org.trialStarted.toMillis() : Date.now() - TRIAL_DAYS * DAY
    const start = Timestamp.fromMillis(Math.max(base, Date.now() - TRIAL_DAYS * DAY) + days * DAY)
    run('trial', () => updateCustomer(org, { plan: 'trial', trialStarted: start }, me, 'trial', `Trial +${days} days`), t('Trial extended.'))
  }
  const label = 'block text-xs font-medium text-muted'
  return (
    <>
      {messages}
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title={t('Plan and price')} className="lg:col-span-2" sub={moneyOk ? undefined : t('Your role can see this but not change it.')}>
          <form onSubmit={save} className="space-y-3">
            <fieldset disabled={!moneyOk} className="grid gap-3 sm:grid-cols-3">
              <label className={label}>{t('Plan')}<select value={plan} onChange={(e) => setPlan(e.target.value as typeof plan)} className={`${inputClass} mt-1`}>{(['early', 'trial', 'free', 'pro'] as const).map((p) => <option key={p} value={p}>{t(PLAN_LABEL[p])}</option>)}</select></label>
              {plan === 'pro' && <label className={label}>{t('Paid until')}<input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={`${inputClass} mt-1`} /></label>}
              {plan === 'pro' && workplace && (
                <label className={label}>{t('Staff covered')}<select value={seats} onChange={(e) => setSeats(e.target.value)} className={`${inputClass} mt-1`}>{['20', '50', '100', '200', '500'].concat(['20', '50', '100', '200', '500'].includes(seats) ? [] : [seats]).map((s) => <option key={s} value={s}>{t('Up to {n} staff', { n: s })}</option>)}</select></label>
              )}
              <label className={label}>{t('Price')}<input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="99" className={`${inputClass} mt-1`} /></label>
              <label className={label}>{t('Currency')}<select value={currency} onChange={(e) => setCurrency(e.target.value as Price['currency'])} className={`${inputClass} mt-1`}><option value="MYR">RM</option><option value="USD">US$</option></select></label>
              <label className={label}>{t('Billed')}<select value={cycle} onChange={(e) => setCycle(e.target.value as Price['cycle'])} className={`${inputClass} mt-1`}><option value="month">{t('Monthly')}</option><option value="semester">{t('Per semester')}</option><option value="year">{t('Yearly')}</option></select></label>
            </fieldset>
            {Number(amount) > 0 && <p className="text-xs text-muted">{t('Counts as {amount} a month in recurring revenue.', { amount: money(Math.round(monthly({ amount: Number(amount), currency, cycle }) * 100) / 100, currency) })}</p>}
            {moneyOk && <Button type="submit" busy={busy === 'plan'}>{t('Save subscription')}</Button>}
          </form>
        </Section>
        <div className="space-y-4">
          <Section title={t('Trial')}>
            <p className="text-sm text-muted">{c.status === 'trial' ? t('On trial, {until}.', { until: planUntil(c) }) : t('A {n}-day Pro trial.', { n: TRIAL_DAYS })}</p>
            {can(me.role, 'support') && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" busy={busy === 'trial'} onClick={() => extendTrial(7)}>{t('+7 days')}</Button>
                <Button variant="secondary" busy={busy === 'trial'} onClick={() => extendTrial(14)}>{t('+14 days')}</Button>
              </div>
            )}
          </Section>
          <Section title={t('Access')}>
            <p className="text-sm text-muted">{org.suspended ? t('Suspended: nobody in this organisation can use Attend.') : t('Active.')}</p>
            {can(me.role, 'suspend') && (
              <div className="mt-3">
                {org.suspended ? (
                  <Button variant="secondary" busy={busy === 'suspend'} onClick={() => run('suspend', () => updateCustomer(org, { suspended: false }, me, 'access', 'Account restored'), t('Account restored.'))}>{t('Restore account')}</Button>
                ) : (
                  <Button variant="danger" busy={busy === 'suspend'} onClick={() => run('suspend', () => updateCustomer(org, { suspended: true }, me, 'access', 'Account suspended'), t('Account suspended.'), t('Suspend {name}? Their people will not be able to use Attend until you restore it. Nothing is deleted.', { name: org.name }))}>{t('Suspend account')}</Button>
                )}
              </div>
            )}
          </Section>
        </div>
      </div>
    </>
  )
}

function BillingTab({ c }: { c: C }) {
  const { billing, invoices, settings, me } = useOwner()
  const { busy, run, messages } = useAction()
  const [form, setForm] = useState<'' | 'invoice' | 'payment' | 'refund'>('')
  const [notice, setNotice] = useState('')
  const close = (message?: string) => {
    setForm('')
    if (message) setNotice(message)
  }
  const mine = invoices.filter((i) => i.organisationId === c.org.id)
  const entries = billing.filter((b) => b.organisationId === c.org.id && b.kind !== 'change')
  const lifetime = entries.reduce<Record<string, number>>((a, b) => ({ ...a, [b.currency ?? 'MYR']: (a[b.currency ?? 'MYR'] ?? 0) + (b.kind === 'refund' ? -1 : 1) * (b.amount ?? 0) }), {})
  const moneyOk = can(me.role, 'money')
  return (
    <>
      {messages}
      {notice && <p className="rounded-lg bg-good-soft px-4 py-2 text-sm text-good">{notice}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{t('Paid in total')}: <span className="font-semibold text-ink">{Object.entries(lifetime).map(([k, v]) => money(v, k)).join(' + ') || money(0)}</span></p>
        {moneyOk && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => { setNotice(''); setForm('invoice') }}>{t('New invoice')}</Button>
            <Button variant="secondary" onClick={() => { setNotice(''); setForm('payment') }}>{t('Record payment')}</Button>
            <Button variant="secondary" onClick={() => { setNotice(''); setForm('refund') }}>{t('Record refund')}</Button>
          </div>
        )}
      </div>
      {form && (
        <Section title={form === 'invoice' ? t('New invoice') : form === 'payment' ? t('Record a payment') : t('Record a refund')}>
          {form === 'invoice' ? <InvoiceForm c={c} onDone={close} /> : <PaymentForm c={c} refund={form === 'refund'} onDone={close} />}
        </Section>
      )}
      <Section title={t('Invoices')}>
        {mine.length === 0 ? (
          <p className="text-sm text-muted">{t('No invoices yet.')}</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {mine.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{i.number}</span> <span className="text-muted">· {formatDate(i.issueDate)} · {t('due {date}', { date: formatDate(i.dueDate) })}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular">{money(i.total, i.currency)}</span>
                  <InvoiceStatus status={i.status} overdue={i.status === 'unpaid' && i.dueDate < isoDate()} />
                  <button type="button" className="text-xs font-medium text-accent" onClick={() => downloadInvoicePdf(i, settings)}>PDF</button>
                  {moneyOk && i.status === 'unpaid' && (
                    <button type="button" className="text-xs font-medium text-bad" disabled={busy === i.id} onClick={() => { const why = window.prompt(t('Why is {n} being voided?', { n: i.number })); if (why) run(i.id, () => voidInvoice(i, why, me), t('Invoice voided.')) }}>{t('Void')}</button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title={t('Payments and refunds')}>
        {entries.length === 0 ? (
          <p className="text-sm text-muted">{t('Nothing received yet.')}</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {entries.map((b) => (
              <li key={b.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{b.kind === 'refund' ? t('Refund') : t('Payment')} · {t(b.method ?? '')}{b.note ? <span className="text-muted"> · {b.note}</span> : null}</span>
                <span className={`tabular ${b.kind === 'refund' ? 'text-bad' : ''}`}>{b.kind === 'refund' ? '−' : ''}{money(b.amount ?? 0, b.currency)} <span className="text-xs text-muted">· {b.at ? dateOf(b.at.toMillis()) : '…'}</span></span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  )
}

export function InvoiceStatus({ status, overdue }: { status: 'unpaid' | 'paid' | 'void'; overdue?: boolean }) {
  const style = status === 'paid' ? 'bg-good-soft text-good' : status === 'void' ? 'bg-slate-100 text-muted line-through' : overdue ? 'bg-bad-soft text-bad' : 'bg-[#fff4d6] text-[#8a5a00]'
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>{status === 'paid' ? t('Paid') : status === 'void' ? t('Void') : overdue ? t('Overdue') : t('Unpaid')}</span>
}

function UsersTab({ c }: { c: C }) {
  const { me } = useOwner()
  const { busy, run, messages } = useAction()
  return (
    <>
      {messages}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-slate-50"><tr>{['Name', 'Email', 'Role', 'Status', ''].map((h) => <th key={h} className={th}>{h && t(h)}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {c.users.map((u) => (
              <tr key={u.id}>
                <td className={td}>{u.name}{u.id === c.org.ownerId && <span className="ml-1.5 rounded bg-accent-soft px-1.5 text-[11px] text-accent">{t('owner')}</span>}</td>
                <td className={td}>{u.email}</td>
                <td className={td}>{u.role === 'admin' ? t('Admin') : t('Manager')}</td>
                <td className={td}>{u.status === 'active' ? t('Active') : <span className="text-bad">{t('Disabled')}</span>}</td>
                <td className={`${td} text-right whitespace-nowrap`}>
                  {can(me.role, 'support') && <button type="button" className="text-xs font-medium text-accent" disabled={busy === `r${u.id}`} onClick={() => run(`r${u.id}`, () => resetPassword(u, me), t('Password reset email sent to {email}.', { email: u.email }), t('Send a password reset email to {email}?', { email: u.email }))}>{t('Reset password')}</button>}
                  {can(me.role, 'users') && (
                    <button type="button" className={`ml-3 text-xs font-medium ${u.status === 'active' ? 'text-bad' : 'text-accent'}`} disabled={busy === `s${u.id}`} onClick={() => run(`s${u.id}`, () => setUserStatus(u, u.status === 'active' ? 'disabled' : 'active', me), u.status === 'active' ? t('User disabled.') : t('User enabled.'), u.status === 'active' ? t('Disable {email}? They will not be able to sign in to their organisation.', { email: u.email }) : undefined)}>
                      {u.status === 'active' ? t('Disable') : t('Enable')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  )
}

function Activity({ c }: { c: C }) {
  const max = Math.max(7, ...c.weekly)
  return (
    <Section title={t('Days used per week')} sub={t('Last 12 weeks, oldest on the left. A day counts when anything was opened.')}>
      <div className="flex h-36 items-end gap-2">
        {c.weekly.map((v, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1" title={t('{n} days', { n: v })}>
            <span className="tabular text-xs text-muted">{v || ''}</span>
            <span className="w-full max-w-10 rounded-t bg-accent" style={{ height: `${(v / max) * 100}px`, minHeight: v ? 3 : 1, opacity: v ? 1 : 0.2 }} />
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted">{t('{n} days used in the last 30 days.', { n: c.active30 })}</p>
    </Section>
  )
}

function NotesTab({ c }: { c: C }) {
  const { notes, tasks, team, me, staffName } = useOwner()
  const { busy, run, messages } = useAction()
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [due, setDue] = useState(addDays(isoDate(), 3))
  const [assignee, setAssignee] = useState(me.id)
  const mineNotes = notes.filter((n) => n.organisationId === c.org.id)
  const mineTasks = tasks.filter((x) => x.organisationId === c.org.id).sort((a, b) => Number(a.done) - Number(b.done) || a.due.localeCompare(b.due))
  const support = can(me.role, 'support')
  return (
    <>
      {messages}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('Notes')} sub={t('A timeline of calls, emails and agreements. Notes cannot be edited later.')}>
          {support && (
            <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) run('note', async () => { await addNote(c.org, text.trim(), me); setText('') }, t('Note added.')) }}>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={4000} placeholder={t('What happened? e.g. Called Encik Ali, agreed to renew yearly from January.')} className={inputClass} />
              <Button type="submit" variant="secondary" busy={busy === 'note'} disabled={!text.trim()}>{t('Add note')}</Button>
            </form>
          )}
          <ul className="mt-4 space-y-3">
            {c.org.ownerNote && <li className="rounded-lg bg-canvas p-3 text-sm"><p className="text-xs text-muted">{t('Earlier note')}</p><p className="whitespace-pre-wrap">{c.org.ownerNote}</p></li>}
            {mineNotes.map((n) => (
              <li key={n.id} className="rounded-lg bg-canvas p-3 text-sm">
                <p className="text-xs text-muted">{n.byEmail} · {n.at ? n.at.toDate().toLocaleString() : '…'}</p>
                <p className="mt-1 whitespace-pre-wrap">{n.text}</p>
              </li>
            ))}
            {mineNotes.length === 0 && !c.org.ownerNote && <li className="text-sm text-muted">{t('No notes yet.')}</li>}
          </ul>
        </Section>
        <Section title={t('Follow-ups')}>
          {support && (
            <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (title.trim()) run('task', async () => { const m = team.find((x) => x.id === assignee); await addTask({ title: title.trim(), due, assignee, assigneeEmail: m?.email ?? '' }, me, c.org); setTitle('') }, t('Follow-up added.')) }}>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} placeholder={t('e.g. Send renewal invoice')} className={inputClass} />
              <div className="flex flex-wrap gap-2">
                <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${inputClass} w-auto`} aria-label={t('Due date')} />
                <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={`${inputClass} w-auto`} aria-label={t('For')}>{team.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}</select>
                <Button type="submit" variant="secondary" busy={busy === 'task'} disabled={!title.trim()}>{t('Add')}</Button>
              </div>
            </form>
          )}
          <ul className="mt-4 divide-y divide-line text-sm">
            {mineTasks.map((x) => (
              <li key={x.id} className="flex items-center gap-3 py-2">
                <input type="checkbox" checked={x.done} disabled={!support} onChange={(e) => run(x.id, () => setTaskDone(x, e.target.checked), '')} className="size-4 accent-accent" aria-label={t('Done')} />
                <span className={`min-w-0 flex-1 ${x.done ? 'text-muted line-through' : ''}`}>{x.title}<span className="block text-xs text-muted">{staffName(x.assignee)} · {formatDate(x.due)}</span></span>
              </li>
            ))}
            {mineTasks.length === 0 && <li className="py-2 text-muted">{t('No follow-ups.')}</li>}
          </ul>
        </Section>
      </div>
    </>
  )
}
