import { describe, expect, it } from 'vitest'
import { buildPayroll } from '../src/lib/payroll'

const at = (date: string, time: string) => {
  const ms = new Date(`${date}T${time}:00`).getTime()
  return { toMillis: () => ms, toDate: () => new Date(ms) }
}
const session = (id: string, date: string) => ({ id, date, startTime: '09:00', endTime: '18:00', rosterId: 'shift' }) as never
const rec = (key: string, date: string, time: string, extra = {}) =>
  ({ studentKey: key, studentId: key, studentName: key, status: 'present', method: 'qr', timestamp: at(date, time), ...extra }) as never
const roster = new Map([['shift', [
  { studentKey: 'E1', studentId: 'E1', studentName: 'Ahmad', department: 'Sales' },
  { studentKey: 'E2', studentId: 'E2', studentName: 'Siti', department: 'Store' },
  { studentKey: 'E3', studentId: 'E3', studentName: 'Kumar', department: 'Store' },
]]])

describe('monthly payroll figures', () => {
  const rows = buildPayroll(
    [session('d1', '2026-10-01'), session('d2', '2026-10-02')],
    new Map([
      ['d1', [rec('E1', '2026-10-01', '08:55'), rec('E2', '2026-10-01', '09:25'), rec('E3', '2026-10-01', '09:00', { status: 'mc', method: 'manual' })]],
      ['d2', [rec('E1', '2026-10-02', '09:00'), rec('E2', '2026-10-02', '09:00', { status: 'excused', method: 'manual' })]],
    ]),
    new Map([
      ['d1', new Map([['E1', at('2026-10-01', '19:30')], ['E2', at('2026-10-01', '18:00')]])],
      ['d2', new Map()],
    ]),
    roster,
  )
  const by = Object.fromEntries(rows.map((r) => [r.key, r]))

  it('adds up hours and splits out overtime after the shift ends', () => {
    expect(by.E1.days).toBe(2)
    expect(Math.round(by.E1.minutes)).toBe(635)
    expect(Math.round(by.E1.overtime)).toBe(90)
    expect(by.E1.noClockOut).toBe(1)
  })

  it('counts lateness from the clock, and MC, leave and absence apart', () => {
    expect(by.E2.late).toBe(1)
    expect(by.E2.lateMinutes).toBe(25)
    expect(by.E2.leave).toBe(1)
    expect(by.E2.absent).toBe(0)
    expect(by.E3.mc).toBe(1)
    expect(by.E3.absent).toBe(1)
    expect(by.E3.days).toBe(0)
  })

  it('carries the department from the staff list and sorts by it', () => {
    expect(rows.map((r) => r.department)).toEqual(['Sales', 'Store', 'Store'])
  })
})
