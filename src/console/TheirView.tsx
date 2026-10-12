import { classSlots, dayName, effectiveStatus, formatDate, formatRange, isoDate } from '../lib/format'
import { t } from '../lib/i18n'
import { planOf } from '../lib/plan'
import type { Session } from '../lib/types'
import { type Customer, dateOf, editionName, statusLabel, useOwner } from './context'
import { LimitChip } from './Limits'
import { limitRows } from './planUse'
import { Section, td, th } from './ui'

const STATUS: Record<string, [string, string]> = {
  scheduled: ['Not started', 'bg-slate-100 text-slate-600'],
  active: ['Open now', 'bg-good-soft text-good'],
  ended: ['Ended', 'bg-slate-100 text-slate-700'],
  expired: ['Ended', 'bg-slate-100 text-slate-700'],
}
const KIND: Record<string, string> = { lecturers: 'Lecturers', staff: 'Staff', classes: 'Classes at a time', students: 'Biggest class' }

/**
 * The customer's account as they see it, for support: their menu, plan, classes and recent
 * sessions, read only. It shows what they have set up and done, never who attended: names and
 * attendance records stay with the customer, and Dobry's team cannot read them.
 */
export function TheirView({ c }: { c: Customer }) {
  const { customers, classes, sessions, users } = useOwner()
  const org = c.org
  const today = isoDate()
  const work = org.purpose === 'workplace'
  const mine = classes.filter((x) => x.organisationId === org.id)
  const running = mine.filter((x) => !x.endDate || x.endDate >= today)
  const ended = mine.length - running.length
  const held = sessions.filter((s) => s.organisationId === org.id).sort((a, b) => b.date.localeCompare(a.date) || (b.startTime ?? '').localeCompare(a.startTime ?? ''))
  const todays = held.filter((s) => s.date === today)
  const limits = limitRows(org, users, classes, today)
  const p = planOf(org)
  const solo = !work && org.purpose !== 'training' && c.users.filter((u) => u.status === 'active').length <= 1 && !(p.active === 'trial' || (p.active === 'pro' && (org.seats ?? 1) > 1))
  const menu = work
    ? ['Today', 'Calendar', 'Working hours', 'Staff', 'Reports', 'History', 'Admin']
    : ['Today', 'Calendar', 'Timetable', org.purpose === 'training' ? 'Participants' : 'Students', 'Reports', 'History', ...(solo ? [] : [org.purpose === 'training' ? 'Admin' : 'Faculty'])]

  // What most often turns out to be the matter when a customer says "it is not working".
  const twins = customers.filter((x) => x.org.id !== org.id && x.org.name.trim().toLowerCase() === org.name.trim().toLowerCase())
  const checks: [boolean, string][] = [
    [twins.length > 0, t('Another account has the same name: {who}. The same person may be using two emails, so what they do on one device does not show on the other.', { who: twins.map((x) => x.owner?.email ?? x.org.id).join(', ') })],
    [mine.length === 0, work ? t('No office or shift has been set up yet.') : t('No class has been added yet.')],
    [running.some((x) => !x.startDate || !x.endDate) && !work, t('Some classes have no semester dates, so they never appear by themselves on the right day.')],
    [running.some((x) => !(x.rosterCount ?? 0) && !x.rosterFrom), work ? t('An office has no staff list, so nobody can clock in there.') : t('Some classes have no student list, so anyone can type any ID, and nobody shows as absent.')],
    [held.length === 0, t('Nothing has been opened in the last 12 weeks.')],
    [limits.some((r) => r.state === 'over'), t('They hold more than their plan covers. Once payments are open, new sessions will not start until it fits.')],
    [Boolean(org.paymentFailure), t('Their card is failing. The plan stays on while Stripe tries again.')],
    [Boolean(org.suspended), t('The account is suspended: nobody in it can use the app.')],
  ]
  const found = checks.filter(([on]) => on)
  const row = (s: Session) => {
    const [label, tone] = STATUS[effectiveStatus(s)] ?? STATUS.ended
    return (
      <tr key={s.id}>
        <td className={`${td} whitespace-nowrap`}>{formatDate(s.date)}</td>
        <td className={td}>{s.name}<span className="block text-xs text-muted">{[s.code, s.section, s.venue].filter(Boolean).join(' · ')}</span></td>
        <td className={`${td} tabular whitespace-nowrap`}>{formatRange(s)}</td>
        <td className={td}>{s.ownerName}</td>
        <td className={td}><span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${tone}`}>{t(label)}</span></td>
        <td className={`${td} tabular`}>{s.status === 'scheduled' ? '—' : `${s.presentCount ?? 0}${s.expected ? ` / ${s.expected}` : ''}`}</td>
        <td className={`${td} text-xs text-muted`}>{[s.rosterId ? t('list') : t('no list'), s.geoMode ? t('location check') : '', s.delivery && s.delivery !== 'in_person' ? t(s.delivery === 'online' ? 'online' : 'hybrid') : ''].filter(Boolean).join(' · ')}</td>
      </tr>
    )
  }
  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent">
        {t('This is {name}’s account as they see it, read only. You see what they have set up and done. Names of students or staff, and who attended, stay private to the customer.', { name: c.owner?.name?.trim() || org.name })}
      </p>

      <Section title={t('Worth checking')} sub={t('The usual reasons a customer says something is not working.')}>
        {found.length === 0 ? (
          <p className="mt-3 text-sm text-good">{t('Nothing stands out. The account is set up and in use.')}</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {found.map(([, text]) => (
              <li key={text} className="flex gap-2"><span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#b25e00]" />{text}</li>
            ))}
          </ul>
        )}
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('Their account')} sub={`Dobry · ${t(editionName(org))}`}>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-muted">{t('Plan')}</dt><dd className="text-right font-medium">{statusLabel(c.status)}{p.until ? ` · ${t('until {date}', { date: dateOf(p.until) })}` : ''}{org.stripeCancelAtPeriodEnd ? ` · ${t('cancelled')}` : ''}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">{t('Signs in as')}</dt><dd className="text-right font-medium break-all">{c.owner?.email ?? '—'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">{t('Their menu')}</dt><dd className="text-right">{menu.map((m) => t(m)).join(' · ')}</dd></div>
            {work && <div className="flex justify-between gap-4"><dt className="text-muted">{t('Work rules')}</dt><dd className="text-right">{[org.shifts ? t('shifts on') : t('office hours'), org.phoneCheck === 'block' ? t('other phones refused') : t('other phones flagged'), org.timezone ?? ''].filter(Boolean).join(' · ')}</dd></div>}
          </dl>
        </Section>
        <Section title={t('Plan limits')} sub={limits.length ? t('What they use of what the plan covers.') : t('This plan has no limits.')}>
          <dl className="mt-3 space-y-1.5 text-sm">
            {limits.map((r) => (
              <div key={r.kind} className="flex items-center justify-between gap-4">
                <dt className="text-muted">{t(KIND[r.kind])}{r.who ? <span className="block text-xs">{r.who}</span> : null}</dt>
                <dd><LimitChip row={r} /></dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>

      <Section title={work ? t('Their offices and shifts') : t('Their timetable')} sub={t('{n} running now, {m} ended', { n: running.length, m: ended })}>
        {running.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t('Nothing is running.')}</p>
        ) : (
          <div className="-mx-5 mt-3 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="bg-slate-50"><tr>{[work ? 'Office or shift' : 'Class', 'When', 'Run by', 'Semester', 'On the list'].map((h) => <th key={h} className={th}>{t(h)}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {running.map((x) => (
                  <tr key={x.id}>
                    <td className={td}>{[x.code, x.name].filter(Boolean).join(' ')}<span className="block text-xs text-muted">{[x.section, x.venue].filter(Boolean).join(' · ')}</span></td>
                    <td className={`${td} text-xs`}>{classSlots(x).map((s) => `${t(dayName(s.day)).slice(0, 3)} ${s.startTime}–${s.endTime}`).join(', ')}</td>
                    <td className={td}>{x.ownerName}</td>
                    <td className={`${td} text-xs whitespace-nowrap`}>{x.startDate && x.endDate ? `${formatDate(x.startDate)} – ${formatDate(x.endDate)}` : <span className="text-[#b25e00]">{t('no dates')}</span>}</td>
                    <td className={`${td} tabular`}>{x.rosterFrom ? t('shared list') : (x.rosterCount ?? 0) || <span className="text-[#b25e00]">{t('no list')}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title={t('Today')} sub={formatDate(today)}>
        {todays.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t('Nothing has been opened or planned as a session today.')}</p>
        ) : (
          <div className="-mx-5 mt-3 overflow-x-auto"><table className="w-full min-w-[44rem] text-sm"><tbody className="divide-y divide-line">{todays.map(row)}</tbody></table></div>
        )}
      </Section>

      <Section title={t('Recent sessions')} sub={t('The last 12 weeks, newest first. Counts only; the names stay with the customer.')}>
        {held.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t('No sessions in the last 12 weeks.')}</p>
        ) : (
          <div className="-mx-5 mt-3 overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="bg-slate-50"><tr>{['Date', 'Session', 'Time', 'Run by', 'State', 'Came', 'Set up'].map((h) => <th key={h} className={th}>{t(h)}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">{held.slice(0, 40).map(row)}</tbody>
            </table>
            {held.length > 40 && <p className="px-5 pt-3 text-xs text-muted">{t('Showing the newest 40 of {n}.', { n: held.length })}</p>}
          </div>
        )}
      </Section>
    </div>
  )
}
