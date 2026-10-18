import { Link } from 'react-router-dom'
import { can } from '../data/platform'
import { isoDate } from '../lib/format'
import { t } from '../lib/i18n'
import { DAY, EDITIONS, dateOf, editionName, lastMonths, money, moneyMix, monthName, revenueByMonth, useOwner } from './context'
import { useFeatureUse } from './featureUse'
import { limitRows, standingOf } from './planUse'
import { HealthBadge, Kpi, PageHead, Section, StatusBadge, planUntil } from './ui'

/** The morning view: money, growth, what is about to happen, and what needs doing. */
export default function Dashboard() {
  const { customers, billing, invoices, tasks, audit, me, users, classes } = useOwner()
  const use = useFeatureUse()
  const now = Date.now()
  const today = isoDate()
  const count = (f: (c: (typeof customers)[number]) => boolean) => customers.filter(f).length

  // Recurring revenue, per currency (never mixed).
  const mrr: Record<string, number> = {}
  for (const c of customers) if (c.mrr && c.org.price) mrr[c.org.price.currency] = (mrr[c.org.price.currency] ?? 0) + c.mrr
  const arr = Object.fromEntries(Object.entries(mrr).map(([k, v]) => [k, v * 12]))
  const paying = count((c) => c.status === 'pro')
  const arpa = paying && mrr.MYR ? mrr.MYR / customers.filter((c) => c.status === 'pro' && c.org.price?.currency === 'MYR').length : 0

  // Churn: paid customers whose paid period ended in the last 30 days and did not renew.
  const churned = customers.filter((c) => c.lapsed && c.org.plan === 'pro' && c.until && now - c.until < 30 * DAY).length
  const churnRate = paying + churned ? Math.round((churned / (paying + churned)) * 1000) / 10 : 0
  // Trial conversion: of the trials that have finished, how many are paying now.
  const trialsDone = customers.filter((c) => c.org.trialStarted && c.status !== 'trial')
  const converted = trialsDone.filter((c) => c.status === 'pro').length
  const conversion = trialsDone.length ? Math.round((converted / trialsDone.length) * 100) : null

  const months = lastMonths(12)
  const revenue = revenueByMonth(billing, months)
  const thisMonth = revenue[revenue.length - 1].sums
  const lastMonth = revenue[revenue.length - 2].sums
  const top = Math.max(1, ...revenue.map((r) => r.sums.MYR ?? 0))
  const unpaid = invoices.filter((i) => i.status === 'unpaid')
  const overdue = unpaid.filter((i) => i.dueDate < today)
  const outstanding = unpaid.reduce<Record<string, number>>((a, i) => ({ ...a, [i.currency]: (a[i.currency] ?? 0) + i.total }), {})

  const renewals = customers.filter((c) => c.until && (c.status === 'pro' || c.status === 'trial') && c.until - now < 30 * DAY).sort((a, b) => (a.until ?? 0) - (b.until ?? 0))
  const atRisk = customers.filter((c) => (c.health === 'risk' || (c.health === 'inactive' && c.status !== 'suspended')) && (c.status === 'pro' || c.status === 'trial'))
  const myTasks = tasks.filter((x) => !x.done && (!x.assignee || x.assignee === me.id)).sort((a, b) => a.due.localeCompare(b.due))

  // The few things worth acting on today, most urgent first. Each leads to where it is dealt with.
  const failing = customers.filter((c) => c.org.paymentFailure || c.org.stripeStatus === 'past_due' || c.org.stripeStatus === 'unpaid')
  const over = customers.filter((c) => standingOf(limitRows(c.org, users, classes, today)) === 'over')
  const endingSoon = renewals.filter((c) => (c.until ?? 0) - now < 7 * DAY)
  const lateTasks = myTasks.filter((x) => x.due < today)
  const needs: [number, string, string, string][] = [
    [failing.length, t('with a card that is failing'), '/console/subscriptions', 'bad'],
    [overdue.length, t('invoices overdue'), '/console/billing', 'bad'],
    [over.length, t('holding more than their plan covers'), '/console/limits', 'warn'],
    [endingSoon.length, t('trials or plans ending within a week'), '/console/subscriptions', 'warn'],
    [atRisk.length, t('paying customers hardly using Dobry'), '/console/customers', 'warn'],
    [lateTasks.length, t('of your tasks overdue'), '/console/tasks', 'warn'],
  ].filter(([n]) => (n as number) > 0) as [number, string, string, string][]

  return (
    <>
      <PageHead title={t('Dashboard')} sub={t('Dobry at a glance, {date}.', { date: dateOf(now) })} />
      <section className={`rounded-2xl px-5 py-4 shadow-card ${needs.length ? 'bg-white' : 'bg-good-soft'}`}>
        <h2 className="font-semibold">{needs.length ? t('Needs you today') : t('All clear today')}</h2>
        {needs.length === 0 ? (
          <p className="mt-0.5 text-sm text-good">{t('No failing cards, nobody over their plan, nothing overdue.')}</p>
        ) : (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {needs.map(([n, what, to, tone]) => (
              <li key={what}>
                <Link to={to} className="flex items-center gap-3 rounded-xl bg-canvas px-3 py-2.5 text-sm hover:bg-slate-100">
                  <span className={`tabular flex size-9 shrink-0 items-center justify-center rounded-lg font-display text-base font-bold ${tone === 'bad' ? 'bg-bad-soft text-bad' : 'bg-[#fff4d6] text-[#8a5a00]'}`}>{n}</span>
                  <span className="min-w-0 flex-1 text-slate-700">{what}</span>
                  <span aria-hidden className="text-muted">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label={t('Monthly recurring revenue')} value={moneyMix(mrr)} note={t('{n} paying customers', { n: paying })} />
        <Kpi label={t('Annual run rate')} value={moneyMix(arr)} note={arpa ? t('{amount} per customer a month', { amount: money(Math.round(arpa)) }) : undefined} />
        <Kpi label={t('Received this month')} value={moneyMix(thisMonth)} note={t('last month {amount}', { amount: moneyMix(lastMonth) })} />
        <Kpi label={t('Customers')} value={customers.length} note={t('{n} new in 30 days', { n: count((c) => Boolean(c.joined && now - c.joined < 30 * DAY)) })} />
        <Kpi label={t('Churn (30 days)')} value={`${churnRate}%`} note={t('{n} did not renew', { n: churned })} tone={churnRate > 5 ? 'warn' : undefined} />
        <Kpi label={t('Trial conversion')} value={conversion === null ? '—' : `${conversion}%`} note={t('{n} of {m} finished trials', { n: converted, m: trialsDone.length })} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={t('Certificates issued (30 days)')} value={use ? use.certificates.last30 : '—'} note={use ? t('{n} in all; each link shows Dobry to someone new', { n: use.certificates.total }) : undefined} />
        <Kpi label={t('Customers giving certificates')} value={use ? Object.keys(use.certificates.byOrg).length : '—'} note={t('of {n} lecturer and trainer customers', { n: count((c) => c.org.purpose !== 'workplace') })} />
        <Kpi label={t('Companies working out pay')} value={use ? use.pay.companies : '—'} note={use ? t('{n} staff paid with Dobry', { n: use.pay.staff }) : undefined} />
        <Kpi label={t('Workplaces using pay')} value={use ? `${count((c) => c.org.purpose === 'workplace') ? Math.round((use.pay.companies / count((c) => c.org.purpose === 'workplace')) * 100) : 0}%` : '—'} note={t('of workplace customers')} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Section title={t('Revenue received')} sub={t('Payments less refunds, last 12 months (RM).')} className="xl:col-span-2">
          <div className="flex h-44 items-end gap-1.5">
            {revenue.map((r) => {
              const v = r.sums.MYR ?? 0
              return (
                <div key={r.month} className="group flex flex-1 flex-col items-center gap-1" title={`${monthName(r.month, true)}: ${moneyMix(r.sums)}`}>
                  <span className="tabular text-[10px] text-muted opacity-0 group-hover:opacity-100">{v ? money(Math.round(v)) : ''}</span>
                  <span className="w-full rounded-t bg-accent" style={{ height: `${(Math.max(0, v) / top) * 130}px`, minHeight: v ? 3 : 1, opacity: v ? 1 : 0.2 }} />
                  <span className="text-[10px] text-muted">{monthName(r.month)}</span>
                </div>
              )
            })}
          </div>
        </Section>
        <Section title={t('Customers by plan')}>
          <ul className="space-y-2 text-sm">
            {(['pro', 'trial', 'early', 'free', 'suspended'] as const).map((s) => {
              const n = count((c) => c.status === s)
              return (
                <li key={s} className="flex items-center gap-3">
                  <span className="w-28"><StatusBadge c={{ status: s, lapsed: false }} /></span>
                  <span className="h-2 flex-1 rounded-full bg-slate-100"><span className="block h-full rounded-full bg-accent" style={{ width: `${customers.length ? (n / customers.length) * 100 : 0}%` }} /></span>
                  <span className="tabular w-8 text-right font-medium">{n}</span>
                </li>
              )
            })}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3 text-sm">
            {EDITIONS.map((e) => (
              <span key={e} className="rounded-md bg-canvas px-2.5 py-1">{e} <span className="font-semibold">{count((c) => editionName(c.org) === e)}</span></span>
            ))}
          </div>
          {unpaid.length > 0 && (
            <p className="mt-3 text-sm">
              <Link to="/console/billing" className="font-medium text-accent">{t('{n} unpaid invoices', { n: unpaid.length })}</Link>
              <span className="text-muted"> · {moneyMix(outstanding)}{overdue.length ? ` · ${t('{n} overdue', { n: overdue.length })}` : ''}</span>
            </p>
          )}
        </Section>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Section title={t('Renewals and trials ending')} sub={t('Next 30 days')}>
          {renewals.length === 0 ? (
            <p className="text-sm text-muted">{t('Nothing ends in the next 30 days.')}</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {renewals.slice(0, 8).map((c) => (
                <li key={c.org.id} className="flex items-center justify-between gap-2 py-2">
                  <Link to={`/console/customers/${c.org.id}`} className="min-w-0 truncate font-medium text-accent hover:underline">{c.org.name}</Link>
                  <span className="shrink-0 text-right text-xs text-muted"><StatusBadge c={c} /> <span className="block">{planUntil(c)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title={t('Customers at risk')} sub={t('Paying or on trial, and not using it much')}>
          {atRisk.length === 0 ? (
            <p className="text-sm text-muted">{t('Every paying customer is using Dobry.')}</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {atRisk.slice(0, 8).map((c) => (
                <li key={c.org.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <Link to={`/console/customers/${c.org.id}`} className="block truncate font-medium text-accent hover:underline">{c.org.name}</Link>
                    <span className="block text-xs text-muted">{c.healthWhy}</span>
                  </span>
                  <HealthBadge c={c} />
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title={t('Your tasks')} actions={<Link to="/console/tasks" className="text-sm font-medium text-accent">{t('All tasks')}</Link>}>
          {myTasks.length === 0 ? (
            <p className="text-sm text-muted">{t('Nothing waiting for you.')}</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {myTasks.slice(0, 8).map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{x.title}</span>
                    {x.organisationName && <span className="block text-xs text-muted">{x.organisationName}</span>}
                  </span>
                  <span className={`shrink-0 text-xs ${x.due < today ? 'font-semibold text-bad' : 'text-muted'}`}>{x.due < today ? t('overdue') : dateOf(new Date(`${x.due}T00:00:00`).getTime())}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {can(me.role, 'audit') && (
        <Section title={t('Recent activity')} actions={<Link to="/console/audit" className="text-sm font-medium text-accent">{t('Audit log')}</Link>}>
          {audit.length === 0 ? (
            <p className="text-sm text-muted">{t('No activity yet.')}</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {audit.slice(0, 8).map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-x-3 py-2">
                  <span className="min-w-0">
                    <span className="font-medium">{a.actorEmail}</span> <span className="text-muted">· {a.organisationName ? `${a.organisationName} · ` : ''}</span>
                    {a.detail}
                  </span>
                  <span className="text-xs text-muted">{a.at ? dateOf(a.at.toMillis()) : '…'}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </>
  )
}
