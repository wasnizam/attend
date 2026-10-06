import { type ClassReport, counts } from './report'
import type { AttendanceStatus, WeeklyClass } from './types'

/**
 * An attendance file in the shape a university's own system accepts. Every system wants
 * something slightly different (P/A or 1/0, day first or year first, one row per class or
 * one column per class), so the lecturer sets it once and Attend remembers it.
 */
export type Mark = AttendanceStatus | 'absent'

export interface UniFormat {
  /** sheet: one row per student, one column per class. list: one row per student per class. */
  layout: 'sheet' | 'list'
  codes: Record<Mark, string>
  date: 'dmy' | 'ymd' | 'mdy'
  header: boolean
  /** Extra columns on every row, when the system wants them. */
  course: boolean
  section: boolean
  time: boolean
  /** Separator: a comma, or a semicolon for systems set up for Europe. */
  separator: ',' | ';'
}

export const CODE_PRESETS: { id: string; label: string; codes: Record<Mark, string> }[] = [
  { id: 'letters', label: 'P / L / E / MC / A', codes: { present: 'P', late: 'L', excused: 'E', mc: 'MC', absent: 'A' } },
  { id: 'pa', label: 'P / A only', codes: { present: 'P', late: 'P', excused: 'A', mc: 'A', absent: 'A' } },
  { id: 'binary', label: '1 / 0', codes: { present: '1', late: '1', excused: '0', mc: '0', absent: '0' } },
  { id: 'words', label: 'Present / Absent', codes: { present: 'Present', late: 'Late', excused: 'Excused', mc: 'MC', absent: 'Absent' } },
  { id: 'malay', label: 'Hadir / Tidak hadir', codes: { present: 'Hadir', late: 'Lewat', excused: 'Dikecualikan', mc: 'MC', absent: 'Tidak hadir' } },
]

export const DEFAULT_FORMAT: UniFormat = {
  layout: 'sheet',
  codes: CODE_PRESETS[0].codes,
  date: 'dmy',
  header: true,
  course: false,
  section: false,
  time: false,
  separator: ',',
}

const KEY = 'attend.uniFormat'

export function loadFormat(): UniFormat {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<UniFormat> | null
    return saved ? { ...DEFAULT_FORMAT, ...saved, codes: { ...DEFAULT_FORMAT.codes, ...(saved.codes ?? {}) } } : DEFAULT_FORMAT
  } catch {
    return DEFAULT_FORMAT
  }
}

export function saveFormat(format: UniFormat) {
  try {
    localStorage.setItem(KEY, JSON.stringify(format))
  } catch {
    // Not remembered on this device; the file is still made.
  }
}

/** 2026-10-05 in the chosen order. */
export function formatDay(iso: string, order: UniFormat['date']): string {
  const [y, m, d] = iso.split('-')
  return order === 'ymd' ? `${y}-${m}-${d}` : order === 'mdy' ? `${m}/${d}/${y}` : `${d}/${m}/${y}`
}

function cell(value: string, separator: string): string {
  // IDs and names are typed by students: neutralise spreadsheet formulas.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return safe.includes(separator) || /["\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** The rows of the file, header first when asked for. */
export function uniRows(report: ClassReport, cls: Pick<WeeklyClass, 'code' | 'section'>, format: UniFormat): string[][] {
  const extra = [...(format.course ? ['Course code'] : []), ...(format.section ? ['Section'] : [])]
  const extraValues = [...(format.course ? [cls.code ?? ''] : []), ...(format.section ? [cls.section ?? ''] : [])]
  // A class before a student joined, or after they dropped, is left blank rather than marked absent.
  const mark = (r: ClassReport['rows'][number], s: ClassReport['held'][number]) => (counts(r, s) ? format.codes[r.marks.get(s.id) ?? 'absent'] : '')
  const rows: string[][] = []
  if (format.layout === 'sheet') {
    if (format.header) rows.push(['Student ID', 'Student Name', ...extra, ...report.held.map((s) => formatDay(s.date, format.date) + (format.time ? ` ${s.startTime}` : ''))])
    for (const r of report.rows) rows.push([r.studentId, r.studentName, ...extraValues, ...report.held.map((s) => mark(r, s))])
  } else {
    if (format.header) rows.push(['Student ID', 'Student Name', ...extra, 'Date', ...(format.time ? ['Time'] : []), 'Status'])
    for (const s of report.held) {
      for (const r of report.rows) rows.push([r.studentId, r.studentName, ...extraValues, formatDay(s.date, format.date), ...(format.time ? [s.startTime] : []), mark(r, s)])
    }
  }
  return rows
}

export function uniCsv(report: ClassReport, cls: Pick<WeeklyClass, 'code' | 'section'>, format: UniFormat): string {
  return uniRows(report, cls, format).map((row) => row.map((v) => cell(v, format.separator)).join(format.separator)).join('\r\n') + '\r\n'
}
