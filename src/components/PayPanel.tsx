import { useEffect, useMemo, useState } from 'react'
import { downloadCsv } from '../lib/csv'
import { t } from '../lib/i18n'
import {
  type Adjustment,
  BASIS_LABEL,
  type Basis,
  DEFAULT_RULES,
  type PayRules,
  type StaffPay,
  loadAdjustments,
  loadPay,
  money,
  payslip,
  payslipsPdf,
  saveAdjustments,
  savePay,
} from '../lib/pay'
import type { PayrollRow } from '../lib/payroll'
import { Button, Card, PageLoader, inputClass } from './ui'

const csvCell = (v: string | number) => {
  const s = String(v)
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}
const EMPTY_ADJ: Adjustment = { add: 0, addNote: '', deduct: 0, deductNote: '' }
const small = `${inputClass} !h-9 !px-2 !text-sm`

/**
 * Pay for the period, from the attendance above: each person's salary, overtime pay, allowances
 * and deductions, and their payslip. Only an admin sees it; salaries never reach a manager's screen.
 */
export function PayPanel({ rows, from, to, periodName, company, slug }: { rows: PayrollRow[]; from: string; to: string; periodName: string; company: string; slug: string }) {
  const [rules, setRules] = useState<PayRules>(DEFAULT_RULES)
  const [staff, setStaff] = useState<Record<string, StaffPay>>({})
  const [adjust, setAdjust] = useState<Record<string, Adjustment>>({})
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState<'' | 'save' | 'adj' | 'pdf'>('')
  const [note, setNote] = useState('')

  useEffect(() => {
    let stale = false
    loadPay().then(
      (s) => {
        if (stale) return
        setRules(s.rules)
        setStaff(s.staff)
        setLoaded(true)
        // The first time, go straight to entering salaries.
        if (!Object.keys(s.staff).length) setEditing(true)
      },
      (e) => !stale && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      stale = true
    }
  }, [])
  useEffect(() => {
    let stale = false
    setAdjust({})
    loadAdjustments(from, to).then((a) => !stale && setAdjust(a), () => {})
    return () => {
      stale = true
    }
  }, [from, to])

  const slips = useMemo(
    () => rows.map((row) => ({ row, pay: staff[row.key], slip: staff[row.key] ? payslip(row, staff[row.key], rules, adjust[row.key]) : null })),
    [rows, staff, rules, adjust],
  )
  const ready = slips.filter((s): s is { row: PayrollRow; pay: StaffPay; slip: NonNullable<typeof s.slip> } => Boolean(s.slip))
  const missing = slips.length - ready.length
  const sum = (f: (s: (typeof ready)[number]) => number) => ready.reduce((a, s) => a + f(s), 0)
  const m = (n: number) => money(n, rules.currency)
  const otOf = (s: (typeof ready)[number]) => s.slip.earnings.filter((e) => [t('Overtime'), t('Rest day work'), t('Public holiday work')].includes(e.label)).reduce((a, e) => a + e.amount, 0)
  const ctx = { company, period: periodName, from, to, currency: rules.currency }

  const setPerson = (key: string, patch: Partial<StaffPay>) => setStaff((all) => ({ ...all, [key]: { basis: 'month', amount: 0, allowance: 0, ot: true, ...(all[key] as StaffPay | undefined), ...patch } }))
  const setRule = (patch: Partial<PayRules>) => setRules((r) => ({ ...r, ...patch }))

  const save = async () => {
    setBusy('save')
    setError('')
    setNote('')
    try {
      const saved = await savePay(rules, Object.fromEntries(Object.entries(staff).filter(([, s]) => s.amount > 0)))
      setRules(saved.rules)
      setStaff(saved.staff)
      setEditing(false)
      setNote(t('Pay settings saved.'))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }
  const saveAdj = async (next: Record<string, Adjustment>) => {
    setBusy('adj')
    setError('')
    try {
      setAdjust(await saveAdjustments(from, to, next))
      setOpen(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }
  const pdf = async (list: typeof ready, name: string) => {
    setBusy('pdf')
    try {
      ;(await payslipsPdf(list, ctx)).save(name)
    } catch {
      setError(t('The PDF could not be made. Try again.'))
    } finally {
      setBusy('')
    }
  }
  const exportCsv = () =>
    downloadCsv(
      `pay-${slug}-excel.csv`,
      [
        [t('Staff ID'), t('Name'), t('Department'), t('Office'), t('Pay basis'), t('Rate'), t('Days worked'), t('Hours'), t('Basic pay'), t('Overtime pay'), t('Allowances'), t('Other additions'), t('Gross pay'), t('Deductions'), t('Pay before statutory deductions')],
        ...ready.map(({ row, pay, slip }) => {
          const basic = slip.earnings[0]?.amount ?? 0
          const ot = otOf({ row, pay, slip })
          const extra = adjust[row.key]?.add ?? 0
          return [row.staffId, row.name, row.department, row.office, t(BASIS_LABEL[pay.basis]), pay.amount, row.days, Math.round((row.minutes / 60) * 100) / 100, basic, ot, Math.round((slip.gross - basic - ot - extra) * 100) / 100, extra, slip.gross, slip.totalDeductions, slip.net]
        }),
      ]
        .map((line) => line.map(csvCell).join(','))
        .join('\r\n') + '\r\n',
      true,
    )

  if (error && !loaded) return <Card className="p-5 text-sm text-bad">{error}</Card>
  if (!loaded) return <Card className="p-5"><PageLoader /></Card>

  return (
    <Card className="space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t('Pay and payslips')}</h2>
          <p className="text-sm text-muted">{t('Worked out from the attendance in this period: salary, overtime, allowances and deductions. Only admins can see this.')}</p>
        </div>
        <Button variant={editing ? 'primary' : 'secondary'} onClick={() => setEditing(!editing)} aria-expanded={editing}>{t('Pay settings')}</Button>
      </div>

      {editing && (
        <div className="space-y-5 rounded-xl bg-canvas p-4 ring-1 ring-line">
          <div>
            <h3 className="text-sm font-semibold">{t('Company rules')}</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <label className="block text-xs font-medium text-muted">{t('Currency')}
                <select value={rules.currency} onChange={(e) => setRule({ currency: e.target.value })} className={`${small} mt-1`}>
                  {['MYR', 'SGD', 'IDR', 'PHP', 'THB', 'BND', 'USD', 'GBP', 'EUR', 'AUD', 'INR'].map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label className="block text-xs font-medium text-muted">{t('Working days a month')}
                <input type="number" min={1} max={31} value={rules.workDays} onChange={(e) => setRule({ workDays: Number(e.target.value) || 26 })} className={`${small} mt-1`} />
              </label>
              <label className="block text-xs font-medium text-muted">{t('Hours a day')}
                <input type="number" min={1} max={24} step={0.5} value={rules.hoursPerDay} onChange={(e) => setRule({ hoursPerDay: Number(e.target.value) || 8 })} className={`${small} mt-1`} />
              </label>
              {([['normal', 'Overtime ×'], ['rest', 'Rest day ×'], ['holiday', 'Public holiday ×']] as const).map(([k, label]) => (
                <label key={k} className="block text-xs font-medium text-muted">{t(label)}
                  <input type="number" min={0} max={10} step={0.25} value={rules.ot[k]} onChange={(e) => setRule({ ot: { ...rules.ot, [k]: Number(e.target.value) } })} className={`${small} mt-1`} />
                </label>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {([['deductAbsent', 'Take a day’s pay off for each day absent without leave'], ['deductUnpaid', 'Take a day’s pay off for each day of unpaid leave'], ['deductLate', 'Take late minutes off at the hourly rate']] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2">
                  <input type="checkbox" checked={rules[k]} onChange={(e) => setRule({ [k]: e.target.checked })} className="size-4 accent-accent" />
                  {t(label)}
                </label>
              ))}
              <label className="flex items-center gap-2">
                {t('Night work allowance, each night')}
                <input type="number" min={0} step={1} value={rules.nightAllowance || ''} placeholder="0" onChange={(e) => setRule({ nightAllowance: Number(e.target.value) || 0 })} className={`${small} w-24`} />
              </label>
            </div>
            <p className="mt-2 text-xs text-muted">
              {t('In Malaysia a monthly salary is divided by 26 for a day’s pay. Overtime is at least 1.5 times the hourly rate, 2 times on a rest day and 3 times on a public holiday. Change these to your company’s policy.')}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold">{t('Each person’s pay')}</h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="py-1.5 pr-2 font-medium">{t('Name')}</th>
                    <th className="px-2 py-1.5 font-medium">{t('Pay basis')}</th>
                    <th className="px-2 py-1.5 font-medium">{t('Amount')}</th>
                    <th className="px-2 py-1.5 font-medium">{t('Fixed allowance')}</th>
                    <th className="px-2 py-1.5 font-medium">{t('Overtime paid')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => {
                    const s = staff[r.key]
                    return (
                      <tr key={r.key}>
                        <td className="py-1.5 pr-2">
                          <span className="font-medium">{r.name}</span>
                          {(r.staffId || r.department) && <span className="block text-xs text-muted">{[r.staffId, r.department].filter(Boolean).join(' · ')}</span>}
                        </td>
                        <td className="px-2 py-1.5">
                          <select value={s?.basis ?? 'month'} onChange={(e) => setPerson(r.key, { basis: e.target.value as Basis })} className={small}>
                            {(['month', 'day', 'hour'] as const).map((b) => <option key={b} value={b}>{t(BASIS_LABEL[b])}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1.5"><input type="number" min={0} step="0.01" value={s?.amount || ''} placeholder="0.00" onChange={(e) => setPerson(r.key, { amount: Number(e.target.value) || 0 })} className={`${small} w-28`} aria-label={t('Amount')} /></td>
                        <td className="px-2 py-1.5"><input type="number" min={0} step="0.01" value={s?.allowance || ''} placeholder="0.00" onChange={(e) => setPerson(r.key, { allowance: Number(e.target.value) || 0 })} className={`${small} w-28`} aria-label={t('Fixed allowance')} /></td>
                        <td className="px-2 py-1.5"><input type="checkbox" checked={s?.ot ?? true} onChange={(e) => setPerson(r.key, { ot: e.target.checked })} className="size-4 accent-accent" aria-label={t('Overtime paid')} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">{t('In Malaysia, staff earning more than RM4,000 a month are not due overtime by law unless they do manual work. Untick them if your company follows that.')}</p>
          </div>
          <div className="flex gap-2">
            <Button busy={busy === 'save'} onClick={save}>{t('Save pay settings')}</Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>{t('Close')}</Button>
          </div>
        </div>
      )}

      {note && <p className="text-sm text-good">{note}</p>}
      {error && <p className="text-sm text-bad">{error}</p>}

      {ready.length === 0 ? (
        <p className="text-sm text-muted">{t('Enter each person’s salary in Pay settings, and their pay for this period appears here.')}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-muted">
                <tr>
                  <th className="py-2 pr-2 pl-3 font-medium">{t('Name')}</th>
                  <th className="px-2 py-2 text-right font-medium">{t('Basic pay')}</th>
                  <th className="px-2 py-2 text-right font-medium">{t('Overtime')}</th>
                  <th className="px-2 py-2 text-right font-medium">{t('Gross pay')}</th>
                  <th className="px-2 py-2 text-right font-medium">{t('Deductions')}</th>
                  <th className="px-2 py-2 text-right font-medium">{t('Pay')}</th>
                  <th className="py-2 pr-3 pl-2" />
                </tr>
              </thead>
              <tbody className="tabular divide-y divide-line">
                {ready.map((s) => {
                  const a = adjust[s.row.key] ?? EMPTY_ADJ
                  return (
                    <PayRow
                      key={s.row.key}
                      name={s.row.name}
                      sub={[s.row.department, t('{n} days', { n: s.row.days })].filter(Boolean).join(' · ')}
                      cells={[m(s.slip.earnings[0]?.amount ?? 0), m(otOf(s)), m(s.slip.gross), m(s.slip.totalDeductions), m(s.slip.net)]}
                      open={open === s.row.key}
                      onToggle={() => setOpen(open === s.row.key ? null : s.row.key)}
                      onPdf={() => pdf([s], `payslip-${slug}-${s.row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`)}
                      adjustment={a}
                      busy={busy === 'adj'}
                      onSave={(next) => saveAdj({ ...adjust, [s.row.key]: next })}
                      breakdown={[...s.slip.earnings.map((e) => ({ ...e, minus: false })), ...s.slip.deductions.map((e) => ({ ...e, minus: true }))].map((e) => ({ label: e.label, detail: e.detail, value: `${e.minus ? '−' : ''}${m(e.amount)}` }))}
                    />
                  )
                })}
              </tbody>
              <tfoot className="tabular border-t-2 border-line font-semibold">
                <tr>
                  <td className="py-2 pr-2 pl-3">{t('Total')} <span className="font-normal text-muted">· {ready.length}</span></td>
                  <td className="px-2 py-2 text-right">{m(sum((s) => s.slip.earnings[0]?.amount ?? 0))}</td>
                  <td className="px-2 py-2 text-right">{m(sum(otOf))}</td>
                  <td className="px-2 py-2 text-right">{m(sum((s) => s.slip.gross))}</td>
                  <td className="px-2 py-2 text-right">{m(sum((s) => s.slip.totalDeductions))}</td>
                  <td className="px-2 py-2 text-right">{m(sum((s) => s.slip.net))}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          {missing > 0 && <p className="text-sm text-[#b25e00]">{t('{n} people have no salary set and are left out. Add them in Pay settings.', { n: missing })}</p>}
          <div className="flex flex-wrap gap-2">
            <Button busy={busy === 'pdf'} onClick={() => pdf(ready, `payslips-${slug}.pdf`)}>{t('Download all payslips (PDF)')}</Button>
            <Button variant="secondary" onClick={exportCsv}>{t('Export pay for Excel')}</Button>
          </div>
          <p className="text-xs text-muted">
            {t('Pay before EPF, SOCSO, EIS and income tax (PCB). Give these figures to your payroll or accountant for those, and check them before paying anyone.')}
          </p>
        </>
      )}
    </Card>
  )
}

/** One person's pay, with how it was worked out and this period's additions and deductions underneath. */
function PayRow({ name, sub, cells, open, onToggle, onPdf, adjustment, busy, onSave, breakdown }: {
  name: string
  sub: string
  cells: string[]
  open: boolean
  onToggle: () => void
  onPdf: () => void
  adjustment: Adjustment
  busy: boolean
  onSave: (a: Adjustment) => void
  breakdown: { label: string; detail?: string; value: string }[]
}) {
  const [a, setA] = useState(adjustment)
  useEffect(() => setA(adjustment), [adjustment, open])
  return (
    <>
      <tr className={open ? 'bg-canvas' : ''}>
        <td className="py-2 pr-2 pl-3">
          <button type="button" onClick={onToggle} className="text-left font-medium hover:text-accent" aria-expanded={open}>{name}</button>
          <span className="block text-xs text-muted">{sub}</span>
        </td>
        {cells.map((c, i) => <td key={i} className={`px-2 py-2 text-right ${i === cells.length - 1 ? 'font-semibold' : ''}`}>{c}</td>)}
        <td className="py-2 pr-3 pl-2 text-right whitespace-nowrap">
          <button type="button" onClick={onToggle} className="mr-3 text-sm font-medium text-accent">{open ? t('Close') : t('Details')}</button>
          <button type="button" onClick={onPdf} className="text-sm font-medium text-accent">{t('Payslip')}</button>
        </td>
      </tr>
      {open && (
        <tr className="bg-canvas">
          <td colSpan={7} className="px-3 pb-4">
            <div className="grid gap-4 md:grid-cols-2">
              <ul className="space-y-1 text-sm">
                {breakdown.map((b, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span>{b.label}{b.detail && <span className="block text-xs text-muted">{b.detail}</span>}</span>
                    <span className="font-medium">{b.value}</span>
                  </li>
                ))}
              </ul>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted uppercase">{t('This period only')}</p>
                <div className="grid grid-cols-[7rem_1fr] gap-2">
                  <input type="number" min={0} step="0.01" value={a.add || ''} placeholder="0.00" onChange={(e) => setA({ ...a, add: Number(e.target.value) || 0 })} className={small} aria-label={t('Addition')} />
                  <input value={a.addNote} maxLength={80} placeholder={t('Addition, e.g. Bonus')} onChange={(e) => setA({ ...a, addNote: e.target.value })} className={small} />
                  <input type="number" min={0} step="0.01" value={a.deduct || ''} placeholder="0.00" onChange={(e) => setA({ ...a, deduct: Number(e.target.value) || 0 })} className={small} aria-label={t('Deduction')} />
                  <input value={a.deductNote} maxLength={80} placeholder={t('Deduction, e.g. Advance')} onChange={(e) => setA({ ...a, deductNote: e.target.value })} className={small} />
                </div>
                <Button busy={busy} onClick={() => onSave(a)} className="!h-9">{t('Save')}</Button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
