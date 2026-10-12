import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, EmptyState } from '../components/ui'
import { isoDate } from '../lib/format'
import { t } from '../lib/i18n'
import { csvDownload, editionName, statusLabel, useOwner } from './context'
import { type LimitRow, type Standing, limitRows, standingOf } from './planUse'
import { Kpi, PageHead, RowCard, RowCards, StatusBadge, Tabs, td, th } from './ui'

type View = 'over' | 'near' | 'ok' | 'none' | 'all'
const KIND_LABEL: Record<LimitRow['kind'], string> = { lecturers: 'Lecturers', staff: 'Staff', classes: 'Classes at a time', students: 'Biggest class' }
const TONE: Record<LimitRow['state'], string> = { over: 'bg-bad-soft text-bad', full: 'bg-[#fff4d6] text-[#8a5a00]', near: 'bg-[#fff4d6] text-[#8a5a00]', ok: 'bg-slate-100 text-slate-700' }

/** One limit as "7 / 5", coloured by how full it is. */
export function LimitChip({ row }: { row: LimitRow }) {
  return (
    <span className={`tabular inline-flex rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${TONE[row.state]}`} title={row.who}>
      {row.used} / {row.max}
    </span>
  )
}

/**
 * Who holds more than their plan covers, and who is nearly there. The first is fairness (and what
 * the app will hold them to once payments are open); the second is the list of customers worth a
 * word about a bigger plan.
 */
export default function Limits() {
  const { customers, users, classes } = useOwner()
  const navigate = useNavigate()
  const [view, setView] = useState<View>('over')
  const today = isoDate()
  const rows = useMemo(
    () => customers.map((c) => { const limits = limitRows(c.org, users, classes, today); return { c, limits, standing: standingOf(limits) } }),
    [customers, users, classes, today],
  )
  const by = (s: Standing) => rows.filter((r) => r.standing === s)
  const lists: Record<View, typeof rows> = { over: by('over'), near: by('near'), ok: by('ok'), none: by('none'), all: rows }
  const shown = lists[view]
  const cell = (limits: LimitRow[], kind: LimitRow['kind']) => {
    const row = limits.find((x) => x.kind === kind)
    return row ? <LimitChip row={row} /> : <span className="text-muted">—</span>
  }
  const text = (limits: LimitRow[], kind: LimitRow['kind']) => {
    const row = limits.find((x) => x.kind === kind)
    return row ? `${row.used} / ${row.max}` : ''
  }
  const exportCsv = () =>
    csvDownload(`dobry-plan-limits-${today}.csv`, [
      ['Company', 'Edition', 'Plan', 'Standing', 'Lecturers', 'Staff', 'Classes at a time', 'Biggest class', 'Contact'],
      ...shown.map(({ c, limits, standing }) => [c.org.name, editionName(c.org), statusLabel(c.status), standing, text(limits, 'lecturers'), text(limits, 'staff'), text(limits, 'classes'), text(limits, 'students'), c.owner?.email ?? '']),
    ])
  return (
    <>
      <PageHead
        title={t('Plan limits')}
        sub={t('What each customer uses of what their plan covers. The app holds a customer to these once payments are open; early access has no limits.')}
        actions={<Button variant="secondary" onClick={exportCsv} disabled={!shown.length}>{t('Export for Excel')}</Button>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t('Over their plan')} value={lists.over.length} note={lists.over.length ? t('Holding more than they pay for') : t('Nobody is over.')} tone={lists.over.length ? 'warn' : 'good'} />
        <Kpi label={t('At or near a limit')} value={lists.near.length} note={t('Worth a word about a bigger plan')} />
        <Kpi label={t('Within their plan')} value={lists.ok.length} />
        <Kpi label={t('No limits')} value={lists.none.length} note={t('Early access, or a plan with none')} />
      </div>
      <Tabs
        value={view}
        onChange={setView}
        items={[
          ['over', t('Over'), lists.over.length],
          ['near', t('At or near'), lists.near.length],
          ['ok', t('Within'), lists.ok.length],
          ['none', t('No limits'), lists.none.length],
          ['all', t('All'), rows.length],
        ]}
      />
      {shown.length === 0 ? (
        <EmptyState title={t('Nothing here')} text={view === 'over' ? t('No customer holds more than their plan covers.') : t('No customers in this view.')} />
      ) : (
        <>
        <RowCards>
          {shown.map(({ c, limits }) => (
            <RowCard key={c.org.id} title={c.org.name} sub={`${editionName(c.org)} · ${c.owner?.email ?? ''}`} right={<StatusBadge c={c} />} onClick={() => navigate(`/console/customers/${c.org.id}`)}>
              {limits.length === 0 && <span>{t('No limits on this plan')}</span>}
              {limits.map((r) => (
                <span key={r.kind} className="inline-flex items-center gap-1.5">{t(KIND_LABEL[r.kind])} <LimitChip row={r} /></span>
              ))}
            </RowCard>
          ))}
        </RowCards>
        <Card className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['Company', 'Edition', 'Plan', ...Object.values(KIND_LABEL), 'What stands out'].map((h) => <th key={h} className={th}>{t(h)}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map(({ c, limits }) => {
                const worst = limits.find((r) => r.state === 'over') ?? limits.find((r) => r.state === 'full' || r.state === 'near')
                return (
                  <tr key={c.org.id} className="cursor-pointer hover:bg-canvas/60" onClick={() => navigate(`/console/customers/${c.org.id}`)}>
                    <td className={`${td} font-medium text-accent`}>{c.org.name}<span className="block text-xs font-normal text-muted">{c.owner?.email}</span></td>
                    <td className={td}>{editionName(c.org)}</td>
                    <td className={td}><StatusBadge c={c} /></td>
                    <td className={td}>{cell(limits, 'lecturers')}</td>
                    <td className={td}>{cell(limits, 'staff')}</td>
                    <td className={td}>{cell(limits, 'classes')}</td>
                    <td className={td}>{cell(limits, 'students')}</td>
                    <td className={`${td} text-muted`}>
                      {worst
                        ? `${t(KIND_LABEL[worst.kind])}: ${worst.state === 'over' ? t('{n} over', { n: worst.used - worst.max }) : worst.state === 'full' ? t('all used') : t('nearly used')}${worst.who ? ` · ${worst.who}` : ''}`
                        : limits.length ? t('Plenty of room') : t('No limits on this plan')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
        </>
      )}
    </>
  )
}
