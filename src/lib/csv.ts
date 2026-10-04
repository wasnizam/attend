import { countedMinutes, formatClock24, formatDate } from './format'
import { t } from './i18n'
import type { AttendanceRecord, Session } from './types'

const HEADER = ['Student ID', 'Student Name', 'Session', 'Date', 'Time', 'Status']
const STATUS = { present: 'Present', late: 'Late', excused: 'Excused', mc: 'MC' }

function cell(value: string): string {
  // Names and IDs are typed by participants: neutralise spreadsheet formulas.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export interface Absentee {
  studentId: string
  studentName: string
  sessionName: string
  date: string
}

/**
 * `outs` (workplace) adds the time each person left and the hours between, as a decimal
 * number a payroll sheet can add up.
 */
export function attendanceCsv(
  records: AttendanceRecord[],
  absent: Absentee[] = [],
  outs?: Map<string, { toMillis(): number }>,
  /** The day, so hours are counted as in the monthly report. */
  session?: Pick<Session, 'date' | 'startTime' | 'countEarly' | 'flexible' | 'breakMin'>,
): string {
  const left = (r: AttendanceRecord) => {
    const out = outs?.get(r.studentKey)
    if (!out) return ['', '']
    const from = r.timestamp?.toMillis()
    const hours = from === undefined ? null : (session ? countedMinutes(from, out.toMillis(), session) : Math.max(0, out.toMillis() - from) / 60_000) / 60
    return [formatClock24(out as never), hours === null ? '' : hours.toFixed(2)]
  }
  const rows = [
    ...records.map((r) => [r.studentId, r.studentName, r.sessionName, formatDate(r.date), formatClock24(r.timestamp), t(STATUS[r.status] ?? 'Present'), ...(outs ? left(r) : [])]),
    ...absent.map((a) => [a.studentId, a.studentName, a.sessionName, formatDate(a.date), '', t('Absent'), ...(outs ? ['', ''] : [])]),
  ]
  const header = outs ? ['Student ID', 'Student Name', 'Session', 'Date', 'In', 'Status', 'Out', 'Hours'] : HEADER
  return [header.map((h) => t(h)), ...rows].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n'
}

/**
 * `excel` adds a UTF-8 byte-order mark so Excel opens non-Latin names correctly
 * when the file is double-clicked.
 */
export function downloadCsv(filename: string, csv: string, excel = false) {
  const blob = new Blob([excel ? '﻿' + csv : csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** A class's list of people, as a file: ID and name. */
export function rosterCsv(list: { studentId: string; studentName: string; department?: string }[]): string {
  const dept = list.some((s) => s.department)
  return [[t('Student ID'), t('Student Name'), ...(dept ? [t('Department')] : [])], ...list.map((s) => [s.studentId, s.studentName, ...(dept ? [s.department ?? ''] : [])])].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n'
}

export function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'attendance'
}
