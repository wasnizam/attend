import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES, payslip } from '../src/lib/pay'
import type { PayrollRow } from '../src/lib/payroll'
import { tidyAdjustments, tidyRules, tidyStaff } from '../api/_lib/pay'

const row = (patch: Partial<PayrollRow> = {}): PayrollRow => ({
  key: 'ali', staffId: 'S1', name: 'Ali', department: '', office: '', days: 22, minutes: 22 * 8 * 60, overtime: 0, late: 0, lateMinutes: 0, mc: 0, leave: 0, absent: 0,
  noClockOut: 0, openDays: 0, timedDays: 22, extraDays: 0, shifts: {}, nightDays: 0, wrongShift: 0, early: 0, earlyMinutes: 0, earlyApproved: 0, halfDays: 0,
  leaveBy: { annual: 0, emergency: 0, unpaid: 0, other: 0 }, restMinutes: 0, holidayMinutes: 0, rate: 100, entries: [], ...patch,
} as PayrollRow)

describe('pay from attendance', () => {
  it('pays a monthly salary in full, with the day and hour rates the Employment Act uses', () => {
    const s = payslip(row(), { basis: 'month', amount: 2600, allowance: 0, ot: true }, DEFAULT_RULES)
    expect(s.dayRate).toBe(100) // 2600 / 26
    expect(s.hourRate).toBe(12.5) // 100 / 8
    expect(s.gross).toBe(2600)
    expect(s.net).toBe(2600)
  })

  it('pays overtime, rest-day and holiday hours at their rates', () => {
    const s = payslip(row({ overtime: 120, restMinutes: 240, holidayMinutes: 60, minutes: 22 * 480 + 420, days: 24, extraDays: 2 }), { basis: 'month', amount: 2600, allowance: 150, ot: true }, DEFAULT_RULES)
    // 2h × 12.5 × 1.5 = 37.5; 4h × 12.5 × 2 = 100; 1h × 12.5 × 3 = 37.5; allowance 150
    expect(s.earnings.map((e) => e.amount)).toEqual([2600, 37.5, 100, 37.5, 150])
    expect(s.gross).toBe(2925)
  })

  it('pays no overtime to someone not due it', () => {
    const s = payslip(row({ overtime: 120 }), { basis: 'month', amount: 5000, allowance: 0, ot: false }, DEFAULT_RULES)
    expect(s.gross).toBe(5000)
  })

  it('takes a day’s pay off a monthly salary for absence and unpaid leave, and late minutes when the company says so', () => {
    const r = row({ absent: 1, leaveBy: { annual: 0, emergency: 0, unpaid: 2, other: 2 }, leave: 2, lateMinutes: 30 })
    const s = payslip(r, { basis: 'month', amount: 2600, allowance: 0, ot: true }, { ...DEFAULT_RULES, deductLate: true })
    expect(s.deductions.map((d) => d.amount)).toEqual([100, 200, 6.25])
    expect(s.net).toBe(2293.75)
    const lenient = payslip(r, { basis: 'month', amount: 2600, allowance: 0, ot: true }, { ...DEFAULT_RULES, deductAbsent: false, deductUnpaid: false })
    expect(lenient.net).toBe(2600)
  })

  it('pays a daily rate for normal days worked, and an hourly rate for normal hours', () => {
    const daily = payslip(row({ days: 20, extraDays: 1, restMinutes: 480, minutes: 21 * 480 }), { basis: 'day', amount: 80, allowance: 0, ot: true }, DEFAULT_RULES)
    // 19 normal days × 80, and the rest day as 8h × 10 × 2
    expect(daily.earnings.map((e) => e.amount)).toEqual([1520, 160])
    expect(payslip(row({ absent: 3 }), { basis: 'day', amount: 80, allowance: 0, ot: true }, DEFAULT_RULES).deductions).toEqual([])
    const hourly = payslip(row({ minutes: 100 * 60 + 90, overtime: 90 }), { basis: 'hour', amount: 10, allowance: 0, ot: true }, DEFAULT_RULES)
    expect(hourly.earnings.map((e) => e.amount)).toEqual([1000, 22.5])
  })

  it('adds this period’s bonus and takes off an advance, and never pays below zero', () => {
    const s = payslip(row(), { basis: 'month', amount: 1000, allowance: 0, ot: true }, DEFAULT_RULES, { add: 200, addNote: 'Bonus', deduct: 50, deductNote: 'Advance' })
    expect(s.earnings.at(-1)).toMatchObject({ label: 'Bonus', amount: 200 })
    expect(s.net).toBe(1150)
    expect(payslip(row(), { basis: 'month', amount: 100, allowance: 0, ot: true }, DEFAULT_RULES, { add: 0, addNote: '', deduct: 500, deductNote: '' }).net).toBe(0)
  })
})

describe('pay settings from a browser', () => {
  it('are kept in range, and people without a salary are dropped', () => {
    expect(tidyRules({ workDays: 99, hoursPerDay: -1, ot: { normal: 'x' }, currency: 'myr!' })).toMatchObject({ workDays: 31, hoursPerDay: 1, ot: { normal: 1.5, rest: 2, holiday: 3 }, currency: 'MYR' })
    expect(tidyStaff({ a: { basis: 'week', amount: 1000.555 }, b: { amount: 0 }, 'x.y': { amount: 5 } })).toEqual({ a: { basis: 'month', amount: 1000.56, allowance: 0, ot: true } })
    expect(tidyAdjustments({ a: { add: 10, addNote: '  Bonus  ' }, b: {} })).toEqual({ a: { add: 10, addNote: 'Bonus', deduct: 0, deductNote: '' } })
  })
})
