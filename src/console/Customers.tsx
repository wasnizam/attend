import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, EmptyState, inputClass } from '../components/ui'
import { formatDate, isoDate } from '../lib/format'
import { t } from '../lib/i18n'
import { EDITIONS, type Status, csvDownload, dateOf, editionName, money, statusLabel, useOwner } from './context'
import { HealthBadge, PageHead, Spark, StatusBadge, planUntil, td, th } from './ui'

export default function Customers() {
  const { customers, team, staffName } = useOwner()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [edition, setEdition] = useState('')
  const [status, setStatus] = useState('')
  const [health, setHealth] = useState('')
  const [tag, setTag] = useState('')
  const [manager, setManager] = useState('')
  const [sort, setSort] = useState<'joined' | 'name' | 'activity' | 'mrr'>('joined')
  const tags = [...new Set(customers.flatMap((c) => c.org.tags ?? []))].sort()
  const term = q.trim().toLowerCase()
  const shown = customers
    .filter(
      (c) =>
        (!term || [c.org.name, c.owner?.email, c.owner?.name, c.org.id, ...(c.org.tags ?? [])].some((v) => v?.toLowerCase().includes(term))) &&
        (!edition || editionName(c.org) === edition) &&
        (!status || c.status === status) &&
        (!health || c.health === health) &&
        (!tag || c.org.tags?.includes(tag)) &&
        (!manager || (manager === 'none' ? !c.org.accountManager : c.org.accountManager === manager)),
    )
    .sort((a, b) =>
      sort === 'name' ? a.org.name.localeCompare(b.org.name) : sort === 'activity' ? b.active30 - a.active30 : sort === 'mrr' ? b.mrr - a.mrr : (b.joined ?? 0) - (a.joined ?? 0),
    )
  const exportCsv = () =>
    csvDownload(`attend-customers-${isoDate()}.csv`, [
      ['Company', 'Customer ID', 'Edition', 'Contact', 'Email', 'Joined', 'People', 'Days used (30 days)', 'Last activity', 'Health', 'Plan', 'Until', 'Monthly revenue', 'Currency', 'Tags', 'Account manager'],
      ...shown.map((c) => [c.org.name, c.org.id, editionName(c.org), c.owner?.name ?? '', c.owner?.email ?? '', dateOf(c.joined), c.people, c.active30, c.lastSeen ?? '', c.health, statusLabel(c.status), dateOf(c.until), c.mrr ? Math.round(c.mrr * 100) / 100 : 0, c.org.price?.currency ?? '', (c.org.tags ?? []).join('; '), c.org.accountManager ? staffName(c.org.accountManager) : '']),
    ])
  const select = (value: string, set: (v: string) => void, all: string, options: [string, string][]) => (
    <select value={value} onChange={(e) => set(e.target.value)} className={`${inputClass} w-auto`}>
      <option value="">{all}</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
  return (
    <>
      <PageHead title={t('Customers')} sub={t('{n} of {m} customers', { n: shown.length, m: customers.length })} actions={<Button variant="secondary" onClick={exportCsv} disabled={shown.length === 0}>{t('Export for Excel')}</Button>} />
      <div className="flex flex-wrap gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search company, contact, email, tag or ID')} className={`${inputClass} max-w-xs`} />
        {select(edition, setEdition, t('All editions'), EDITIONS.map((e) => [e, e]))}
        {select(status, setStatus, t('Any plan'), (['pro', 'trial', 'early', 'free', 'suspended'] as Status[]).map((s) => [s, statusLabel(s)]))}
        {select(health, setHealth, t('Any health'), [['healthy', t('Healthy')], ['risk', t('At risk')], ['inactive', t('Inactive')]])}
        {tags.length > 0 && select(tag, setTag, t('Any tag'), tags.map((x) => [x, x]))}
        {select(manager, setManager, t('Any account manager'), [['none', t('No account manager')], ...team.map((m) => [m.id, m.name || m.email] as [string, string])])}
        {select(sort, (v) => setSort(v as typeof sort), t('Sort: newest'), [['name', t('Sort: name')], ['activity', t('Sort: most active')], ['mrr', t('Sort: revenue')]])}
      </div>
      {shown.length === 0 ? (
        <EmptyState title={t('No customers match')} text={t('Try another search or filter.')} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[64rem] text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['Company', 'Edition', 'Contact', 'People', 'Usage (12 weeks)', 'Health', 'Plan', 'Revenue / month'].map((h) => <th key={h} className={th}>{t(h)}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((c) => (
                <tr key={c.org.id} className="cursor-pointer hover:bg-canvas/60" onClick={() => navigate(`/console/customers/${c.org.id}`)}>
                  <td className={td}>
                    <span className="block font-medium text-accent">{c.org.name}</span>
                    <span className="block text-xs text-muted">{t('joined {date}', { date: dateOf(c.joined) })}</span>
                    {(c.org.tags ?? []).length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">{c.org.tags!.map((x) => <span key={x} className="rounded bg-slate-100 px-1.5 text-[11px] text-muted">{x}</span>)}</span>
                    )}
                  </td>
                  <td className={td}>{editionName(c.org)}</td>
                  <td className={td}>
                    <span className="block">{c.owner?.name ?? '—'}</span>
                    <span className="block text-xs text-muted">{c.owner?.email}</span>
                  </td>
                  <td className={`${td} tabular`}>{c.people}</td>
                  <td className={td}>
                    <Spark values={c.weekly} />
                    <span className="block text-xs text-muted">{c.lastSeen ? t('last {date}', { date: formatDate(c.lastSeen) }) : t('no activity')}</span>
                  </td>
                  <td className={td}><HealthBadge c={c} /></td>
                  <td className={td}>
                    <StatusBadge c={c} />
                    <span className="block text-xs text-muted">{planUntil(c)}</span>
                  </td>
                  <td className={`${td} tabular`}>{c.mrr ? money(Math.round(c.mrr * 100) / 100, c.org.price?.currency) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  )
}
