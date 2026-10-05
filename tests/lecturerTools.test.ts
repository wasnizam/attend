import { describe, expect, it } from 'vitest'
import { absentDates, fill, nextStep } from '../src/lib/lettersPdf'
import type { ClassReport, StudentRow } from '../src/lib/report'
import type { Session } from '../src/lib/types'
import { CODE_PRESETS, DEFAULT_FORMAT, formatDay, uniCsv, uniRows } from '../src/lib/uniExport'

const session = (id: string, date: string) => ({ id, date, startTime: '10:00' }) as Session
const held = [session('s1', '2026-10-05'), session('s2', '2026-10-12'), session('s3', '2026-10-19')]

const row = (key: string, name: string, marks: [string, StudentRow['marks'] extends Map<string, infer V> ? V : never][], extra: Partial<StudentRow> = {}): StudentRow => ({
  key,
  studentId: key,
  studentName: name,
  present: 0,
  late: 0,
  excused: 0,
  mc: 0,
  absent: 3 - marks.length,
  minutes: 0,
  rate: null,
  level: 'ok',
  canMiss: 0,
  marks: new Map(marks),
  monthly: new Map(),
  ...extra,
})

const report = {
  held,
  planned: 14,
  rows: [row('A1', 'Aisha Bello', [['s1', 'present'], ['s2', 'late'], ['s3', 'mc']]), row('B2', 'Ravi, Shah', [['s1', 'present']], { rate: 33.3, canMiss: 1, level: 'warning' })],
  trend: [],
  average: null,
  warnAfter: 2,
  barAfter: 3,
  months: [],
  required: 80,
} as unknown as ClassReport

const cls = { name: 'Data Structures', code: 'SECJ2013', section: '02' }

describe('export for a university system', () => {
  it('writes dates in the chosen order', () => {
    expect(formatDay('2026-10-05', 'dmy')).toBe('05/10/2026')
    expect(formatDay('2026-10-05', 'ymd')).toBe('2026-10-05')
    expect(formatDay('2026-10-05', 'mdy')).toBe('10/05/2026')
  })

  it('makes one row per student with a column per class, using the chosen codes', () => {
    const rows = uniRows(report, cls, DEFAULT_FORMAT)
    expect(rows[0]).toEqual(['Student ID', 'Student Name', '05/10/2026', '12/10/2026', '19/10/2026'])
    expect(rows[1]).toEqual(['A1', 'Aisha Bello', 'P', 'L', 'MC'])
    expect(rows[2]).toEqual(['B2', 'Ravi, Shah', 'P', 'A', 'A'])
  })

  it('makes one row per student per class, with extra columns and 1/0 codes', () => {
    const binary = CODE_PRESETS.find((p) => p.id === 'binary')!.codes
    const rows = uniRows(report, cls, { ...DEFAULT_FORMAT, layout: 'list', codes: binary, course: true, section: true, time: true, header: false })
    expect(rows).toHaveLength(6)
    expect(rows[0]).toEqual(['A1', 'Aisha Bello', 'SECJ2013', '02', '05/10/2026', '10:00', '1'])
    expect(rows[5]).toEqual(['B2', 'Ravi, Shah', 'SECJ2013', '02', '19/10/2026', '10:00', '0'])
  })

  it('quotes a value that contains the separator', () => {
    expect(uniCsv(report, cls, DEFAULT_FORMAT)).toContain('"Ravi, Shah"')
    expect(uniCsv(report, cls, { ...DEFAULT_FORMAT, separator: ';' })).toContain('B2;Ravi, Shah;P;A;A')
  })
})

describe('warning letters', () => {
  const ctx = { cls, report, lecturer: 'Dr Grace Kim', institution: 'Faculty of Computing', date: '2026-10-20' }

  it('fills in the student’s own figures', () => {
    const text = fill('{student} ({id}) missed {absent} of {held} classes of {course}; now {rate}, needs {required}%, can miss {canMiss}. {lecturer}', report.rows[1], ctx)
    expect(text).toBe('Ravi, Shah (B2) missed 2 of 3 classes of SECJ2013 Data Structures; now 33.3%, needs 80%, can miss 1. Dr Grace Kim')
  })

  it('says what happens next in words that fit the number', () => {
    expect(nextStep(0, 'en')).toBe('One more absence without a reason will bar you from the final examination.')
    expect(nextStep(1, 'en')).toContain('1 more class without')
    expect(nextStep(3, 'en')).toContain('3 more classes without')
    expect(fill('{nextStep}', report.rows[1], ctx, 'ms')).toContain('1 kelas lagi')
  })

  it('leaves unknown words alone', () => {
    expect(fill('Hello {nobody}', report.rows[0], ctx)).toBe('Hello {nobody}')
  })

  it('lists only the classes missed without a reason', () => {
    expect(absentDates(report.rows[0], report)).toEqual([])
    expect(absentDates(report.rows[1], report)).toHaveLength(2)
  })
})
