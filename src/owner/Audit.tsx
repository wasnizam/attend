import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, EmptyState, inputClass } from '../components/ui'
import { isoDate } from '../lib/format'
import { t } from '../lib/i18n'
import { csvDownload, useOwner } from './context'
import { PageHead, td, th } from './ui'

/** Everything the team has done, in order. Entries cannot be changed or removed. */
export default function Audit() {
  const { audit, team } = useOwner()
  const [q, setQ] = useState('')
  const [actor, setActor] = useState('')
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const actions = [...new Set(audit.map((a) => a.action))].sort()
  const term = q.trim().toLowerCase()
  const shown = audit.filter(
    (a) =>
      (!term || `${a.detail} ${a.organisationName} ${a.actorEmail}`.toLowerCase().includes(term)) &&
      (!actor || a.actor === actor) &&
      (!action || a.action === action) &&
      (!from || (a.at && isoDate(a.at.toDate()) >= from)),
  )
  const exportCsv = () =>
    csvDownload(`attend-audit-${isoDate()}.csv`, [['When', 'Who', 'Action', 'Customer', 'Detail'], ...shown.map((a) => [a.at ? a.at.toDate().toISOString() : '', a.actorEmail ?? a.actor, a.action, a.organisationName ?? '', a.detail ?? ''])])
  return (
    <>
      <PageHead title={t('Audit log')} sub={t('Every change the team makes, kept for good: nobody can edit or delete an entry.')} actions={<Button variant="secondary" onClick={exportCsv} disabled={!shown.length}>{t('Export for Excel')}</Button>} />
      <div className="flex flex-wrap gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search details or customer')} className={`${inputClass} max-w-xs`} />
        <select value={actor} onChange={(e) => setActor(e.target.value)} className={`${inputClass} w-auto`}><option value="">{t('Anyone')}</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}</select>
        <select value={action} onChange={(e) => setAction(e.target.value)} className={`${inputClass} w-auto`}><option value="">{t('Any action')}</option>{actions.map((x) => <option key={x} value={x}>{x}</option>)}</select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} w-auto`} aria-label={t('From')} />
      </div>
      {shown.length === 0 ? (
        <EmptyState title={t('No entries')} text={t('Changes appear here as the team works.')} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="bg-slate-50"><tr>{['When', 'Who', 'Action', 'Customer', 'Detail'].map((h) => <th key={h} className={th}>{t(h)}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {shown.slice(0, 1000).map((a) => (
                <tr key={a.id}>
                  <td className={`${td} whitespace-nowrap text-muted`}>{a.at ? a.at.toDate().toLocaleString() : '…'}</td>
                  <td className={td}>{a.actorEmail}</td>
                  <td className={td}><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{a.action}</span></td>
                  <td className={td}>{a.organisationId ? <Link to={`/owner/customers/${a.organisationId}`} className="text-accent hover:underline">{a.organisationName}</Link> : '—'}</td>
                  <td className={td}>{a.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  )
}
