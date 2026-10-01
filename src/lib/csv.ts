import { formatClock24, formatDate } from './format'
import { t } from './i18n'
import type { AttendanceRecord } from './types'

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

export function attendanceCsv(records: AttendanceRecord[], absent: Absentee[] = []): string {
  const rows = [
    ...records.map((r) => [r.studentId, r.studentName, r.sessionName, formatDate(r.date), formatClock24(r.timestamp), t(STATUS[r.status] ?? 'Present')]),
    ...absent.map((a) => [a.studentId, a.studentName, a.sessionName, formatDate(a.date), '', t('Absent')]),
  ]
  return [HEADER.map((h) => t(h)), ...rows].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n'
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

export function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'attendance'
}
