/**
 * Pay worked out from attendance: salary, overtime pay, allowances and deductions, and a payslip.
 * Statutory deductions (EPF, SOCSO, EIS, tax) are not worked out here: the payslip says so, and
 * the figures go to the company's payroll or accountant for those.
 *
 * The settings live on the server (api/pay.ts), readable by the company's admins only.
 */
import { auth } from './auth'
import { formatDate, isoDate } from './format'
import { t } from './i18n'
import type { PayrollRow } from './payroll'

export type Basis = 'month' | 'day' | 'hour'

export interface PayRules {
  currency: string
  workDays: number
  hoursPerDay: number
  ot: { normal: number; rest: number; holiday: number }
  deductAbsent: boolean
  deductUnpaid: boolean
  deductLate: boolean
  nightAllowance: number
}

export interface StaffPay {
  basis: Basis
  amount: number
  allowance: number
  ot: boolean
}

export interface Adjustment {
  add: number
  addNote: string
  deduct: number
  deductNote: string
}

export const DEFAULT_RULES: PayRules = {
  currency: 'MYR',
  workDays: 26,
  hoursPerDay: 8,
  ot: { normal: 1.5, rest: 2, holiday: 3 },
  deductAbsent: true,
  deductUnpaid: true,
  deductLate: false,
  nightAllowance: 0,
}

export const BASIS_LABEL: Record<Basis, string> = { month: 'Monthly salary', day: 'Daily rate', hour: 'Hourly rate' }

/** One line on a payslip. */
export interface PayItem {
  label: string
  /** How it was worked out, e.g. "6h 30m × RM12.50 × 1.5". */
  detail?: string
  amount: number
}

export interface Payslip {
  key: string
  earnings: PayItem[]
  deductions: PayItem[]
  gross: number
  totalDeductions: number
  /** Pay before statutory deductions. Never below zero. */
  net: number
  /** A day's and an hour's pay, as the law calls them: the ordinary and hourly rates of pay. */
  dayRate: number
  hourRate: number
}

const round = (n: number) => Math.round(n * 100) / 100
const hoursText = (minutes: number) => {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m ? `${h}h ${m}m` : `${h}h`
}

export const money = (n: number, currency: string) =>
  `${currency === 'MYR' ? 'RM' : currency === 'USD' ? '$' : `${currency} `}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * A person's pay for the period from their attendance. A monthly salary is for the whole period
 * (pay is worked out a month, or a pay period, at a time); a daily rate is paid for each normal
 * day worked; an hourly rate for each normal hour. Work on rest days and public holidays, and
 * overtime, is paid by the hour at the company's rates.
 */
export function payslip(row: PayrollRow, pay: StaffPay, rules: PayRules, adj?: Adjustment | null): Payslip {
  const cur = rules.currency
  const dayRate = pay.basis === 'month' ? pay.amount / rules.workDays : pay.basis === 'day' ? pay.amount : pay.amount * rules.hoursPerDay
  const hourRate = pay.basis === 'hour' ? pay.amount : dayRate / rules.hoursPerDay
  const normalDays = Math.max(0, row.days - row.extraDays)
  const normalMinutes = Math.max(0, row.minutes - row.overtime - row.restMinutes - row.holidayMinutes)
  const r = (n: number) => money(round(n), cur)

  const earnings: PayItem[] = []
  if (pay.basis === 'month') earnings.push({ label: t('Basic salary'), amount: round(pay.amount) })
  else if (pay.basis === 'day') earnings.push({ label: t('Basic pay'), detail: t(normalDays === 1 ? '1 day × {rate}' : '{n} days × {rate}', { n: normalDays, rate: r(pay.amount) }), amount: round(normalDays * pay.amount) })
  else earnings.push({ label: t('Basic pay'), detail: `${hoursText(normalMinutes)} × ${r(pay.amount)}`, amount: round((normalMinutes / 60) * pay.amount) })

  if (pay.ot) {
    const ot = (label: string, minutes: number, times: number) => {
      if (minutes >= 1 && times > 0) earnings.push({ label, detail: `${hoursText(minutes)} × ${r(hourRate)} × ${times}`, amount: round((minutes / 60) * hourRate * times) })
    }
    ot(t('Overtime'), row.overtime, rules.ot.normal)
    ot(t('Rest day work'), row.restMinutes, rules.ot.rest)
    ot(t('Public holiday work'), row.holidayMinutes, rules.ot.holiday)
  }
  if (pay.allowance > 0) earnings.push({ label: t('Fixed allowance'), amount: round(pay.allowance) })
  if (rules.nightAllowance > 0 && row.nightDays > 0) earnings.push({ label: t('Night work allowance'), detail: t(row.nightDays === 1 ? '1 night × {rate}' : '{n} nights × {rate}', { n: row.nightDays, rate: r(rules.nightAllowance) }), amount: round(row.nightDays * rules.nightAllowance) })
  if (adj?.add) earnings.push({ label: adj.addNote || t('Other additions'), amount: round(adj.add) })

  const deductions: PayItem[] = []
  // Daily and hourly pay already leaves out days not worked; only a monthly salary is reduced.
  if (pay.basis === 'month' && rules.deductAbsent && row.absent > 0) deductions.push({ label: t('Absent without leave'), detail: t(row.absent === 1 ? '1 day × {rate}' : '{n} days × {rate}', { n: row.absent, rate: r(dayRate) }), amount: round(row.absent * dayRate) })
  if (pay.basis === 'month' && rules.deductUnpaid && row.leaveBy.unpaid > 0) deductions.push({ label: t('Unpaid leave'), detail: t(row.leaveBy.unpaid === 1 ? '1 day × {rate}' : '{n} days × {rate}', { n: row.leaveBy.unpaid, rate: r(dayRate) }), amount: round(row.leaveBy.unpaid * dayRate) })
  if (rules.deductLate && row.lateMinutes >= 1) deductions.push({ label: t('Late'), detail: `${Math.round(row.lateMinutes)} min × ${r(hourRate / 60)}`, amount: round((row.lateMinutes / 60) * hourRate) })
  if (adj?.deduct) deductions.push({ label: adj.deductNote || t('Other deductions'), amount: round(adj.deduct) })

  const gross = round(earnings.reduce((a, x) => a + x.amount, 0))
  const totalDeductions = round(deductions.reduce((a, x) => a + x.amount, 0))
  return { key: row.key, earnings, deductions, gross, totalDeductions, net: Math.max(0, round(gross - totalDeductions)), dayRate: round(dayRate), hourRate: round(hourRate) }
}

// ---------- the server ----------

async function call<T>(body: object): Promise<T> {
  const token = await auth.currentUser?.getIdToken()
  let res: Response
  try {
    res = await fetch('/api/pay', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token ?? ''}` }, body: JSON.stringify(body) })
  } catch {
    throw new Error(t('Dobry could not be reached. Check your connection and try again.'))
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(data.error ? t(data.error) : t('Pay is not available right now. Please try again later.'))
  return data as T
}

export interface PaySettings {
  rules: PayRules
  staff: Record<string, StaffPay>
  saved: boolean
}

export const loadPay = () => call<PaySettings>({ action: 'get' })
export const savePay = (rules: PayRules, staff: Record<string, StaffPay>) => call<PaySettings>({ action: 'save', rules, staff })
export const loadAdjustments = (from: string, to: string) => call<{ adjustments: Record<string, Adjustment> }>({ action: 'period', period: `${from}_${to}` }).then((r) => r.adjustments)
export const saveAdjustments = (from: string, to: string, adjustments: Record<string, Adjustment>) =>
  call<{ adjustments: Record<string, Adjustment> }>({ action: 'savePeriod', period: `${from}_${to}`, adjustments }).then((r) => r.adjustments)

// ---------- payslips ----------

const NIGHT: [number, number, number] = [22, 18, 63]
const INK: [number, number, number] = [15, 23, 42]
const MUTED: [number, number, number] = [100, 116, 139]
const LINE: [number, number, number] = [226, 232, 240]

export interface SlipPerson {
  row: PayrollRow
  pay: StaffPay
  slip: Payslip
}

/** One payslip per page, A4. */
export async function payslipsPdf(people: SlipPerson[], ctx: { company: string; period: string; from: string; to: string; currency: string }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const M = 18
  const m = (n: number) => money(n, ctx.currency)
  people.forEach(({ row, pay, slip }, i) => {
    if (i) doc.addPage()
    doc.setFillColor(...NIGHT)
    doc.rect(0, 0, W, 4, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(...INK)
    doc.text(ctx.company || t('Payslip'), M, 18)
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...NIGHT)
    doc.text(t('PAYSLIP'), W - M, 18, { align: 'right', charSpace: 0.8 })
    doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...MUTED)
    doc.text(`${ctx.period}  ·  ${formatDate(ctx.from)} – ${formatDate(ctx.to)}`, W - M, 24, { align: 'right' })

    autoTable(doc, {
      startY: 32,
      margin: { left: M, right: M },
      theme: 'plain',
      styles: { fontSize: 9.5, textColor: INK, cellPadding: 1.4 },
      columnStyles: { 0: { textColor: MUTED, cellWidth: 34 }, 2: { textColor: MUTED, cellWidth: 34 } },
      body: [
        [t('Name'), row.name, t('Staff ID'), row.staffId || '-'],
        [t('Department'), row.department || '-', t('Office'), row.office || '-'],
        [t(BASIS_LABEL[pay.basis]), m(pay.amount), t('Days worked'), String(row.days)],
        [t('Hourly rate'), m(slip.hourRate), t('Hours worked'), hoursText(row.minutes)],
      ],
    })
    let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6

    const table = (heading: string, items: PayItem[], totalLabel: string, totalValue: number) => {
      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        head: [[heading, '', '']],
        body: items.length ? items.map((x) => [x.label, x.detail ?? '', m(x.amount)]) : [[t('None'), '', m(0)]],
        foot: [[totalLabel, '', { content: m(totalValue), styles: { halign: 'right' } }]],
        theme: 'plain',
        styles: { fontSize: 9.5, textColor: INK, cellPadding: 2, lineColor: LINE },
        headStyles: { fillColor: [248, 250, 252], textColor: MUTED, fontStyle: 'bold' },
        footStyles: { fontStyle: 'bold', textColor: INK, lineWidth: { top: 0.3 } },
        columnStyles: { 1: { textColor: MUTED, fontSize: 8.5 }, 2: { halign: 'right', cellWidth: 36 } },
      })
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5
    }
    table(t('Earnings'), slip.earnings, t('Gross pay'), slip.gross)
    table(t('Deductions'), slip.deductions, t('Total deductions'), slip.totalDeductions)

    doc.setFillColor(...NIGHT)
    doc.roundedRect(M, y, W - 2 * M, 14, 2, 2, 'F')
    doc.setTextColor(255, 255, 255).setFont('helvetica', 'bold').setFontSize(11)
    doc.text(t('Pay before statutory deductions'), M + 5, y + 9)
    doc.setFontSize(13)
    doc.text(m(slip.net), W - M - 5, y + 9.2, { align: 'right' })
    y += 22

    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED)
    const note = t('EPF, SOCSO, EIS and income tax (PCB) are not included. Your employer works these out and pays the final amount.')
    doc.text(doc.splitTextToSize(note, W - 2 * M) as string[], M, y)
    doc.setFontSize(7.5)
    doc.text(t('Worked out from attendance with Dobry on {date}', { date: formatDate(isoDate()) }), M, 287)
  })
  return doc
}
