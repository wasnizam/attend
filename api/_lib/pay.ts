/**
 * Pay settings: each person's salary and the company's pay rules, and one-off additions and
 * deductions for a pay period. They are kept where no browser can read them directly, and only
 * an admin of the company can see or change them through api/pay.ts, so a manager who runs a
 * branch never sees anyone's salary.
 */

export type Basis = 'month' | 'day' | 'hour'

export interface PayRules {
  /** Shown on the payslip, e.g. MYR. */
  currency: string
  /** Working days in a month, to turn a monthly salary into a day's pay (26 in Malaysia). */
  workDays: number
  /** Normal hours in a working day, to turn a day's pay into an hour's. */
  hoursPerDay: number
  /** Overtime rates, as times the hourly rate. */
  ot: { normal: number; rest: number; holiday: number }
  /** Monthly salaries lose a day's pay for each day absent without leave. */
  deductAbsent: boolean
  /** Monthly salaries lose a day's pay for each day of unpaid leave. */
  deductUnpaid: boolean
  /** Late minutes are taken off at the hourly rate. */
  deductLate: boolean
  /** Paid for each day on a shift that runs past midnight. */
  nightAllowance: number
}

export interface StaffPay {
  basis: Basis
  amount: number
  /** A fixed amount added every period: transport, meals, and so on. */
  allowance: number
  /** Whether overtime is paid. In Malaysia, staff earning over RM4,000 a month are not due it by law, unless they do manual work. */
  ot: boolean
}

export interface PaySettings {
  rules: PayRules
  staff: Record<string, StaffPay>
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

const MAX_MONEY = 10_000_000
const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 100) / 100)) : fallback
}
const text = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/** Rules as sent by a browser, made safe: every number in range, anything unknown dropped. */
export function tidyRules(raw: unknown): PayRules {
  const r = (raw ?? {}) as Partial<PayRules> & { ot?: Partial<PayRules['ot']> }
  return {
    currency: text(r.currency, 6).toUpperCase().replace(/[^A-Z]/g, '') || DEFAULT_RULES.currency,
    workDays: num(r.workDays, 1, 31, DEFAULT_RULES.workDays),
    hoursPerDay: num(r.hoursPerDay, 1, 24, DEFAULT_RULES.hoursPerDay),
    ot: {
      normal: num(r.ot?.normal, 0, 10, DEFAULT_RULES.ot.normal),
      rest: num(r.ot?.rest, 0, 10, DEFAULT_RULES.ot.rest),
      holiday: num(r.ot?.holiday, 0, 10, DEFAULT_RULES.ot.holiday),
    },
    deductAbsent: r.deductAbsent === undefined ? DEFAULT_RULES.deductAbsent : Boolean(r.deductAbsent),
    deductUnpaid: r.deductUnpaid === undefined ? DEFAULT_RULES.deductUnpaid : Boolean(r.deductUnpaid),
    deductLate: Boolean(r.deductLate),
    nightAllowance: num(r.nightAllowance, 0, MAX_MONEY, 0),
  }
}

/** A person's key as the staff list has it. Keys become field names, so a few characters are refused. */
export const safeKey = (k: string) => k.length > 0 && k.length <= 200 && !/[./[\]*`~]/.test(k)

export function tidyStaff(raw: unknown): Record<string, StaffPay> {
  const out: Record<string, StaffPay> = {}
  const entries = Object.entries((raw ?? {}) as Record<string, Partial<StaffPay>>).slice(0, 2000)
  for (const [key, s] of entries) {
    if (!safeKey(key) || !s || typeof s !== 'object') continue
    const amount = num(s.amount, 0, MAX_MONEY, 0)
    if (!amount) continue
    out[key] = {
      basis: s.basis === 'day' || s.basis === 'hour' ? s.basis : 'month',
      amount,
      allowance: num(s.allowance, 0, MAX_MONEY, 0),
      ot: s.ot === undefined ? true : Boolean(s.ot),
    }
  }
  return out
}

export function tidyAdjustments(raw: unknown): Record<string, Adjustment> {
  const out: Record<string, Adjustment> = {}
  const entries = Object.entries((raw ?? {}) as Record<string, Partial<Adjustment>>).slice(0, 2000)
  for (const [key, a] of entries) {
    if (!safeKey(key) || !a || typeof a !== 'object') continue
    const adj = { add: num(a.add, 0, MAX_MONEY, 0), addNote: text(a.addNote, 80), deduct: num(a.deduct, 0, MAX_MONEY, 0), deductNote: text(a.deductNote, 80) }
    if (adj.add || adj.deduct) out[key] = adj
  }
  return out
}

/** A pay period, as its first and last day: 2026-10-01_2026-10-31. */
export const tidyPeriod = (raw: unknown) => {
  const s = String(raw ?? '')
  return /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
}
