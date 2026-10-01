import type { Timestamp } from 'firebase/firestore'
import { locale, t } from './i18n'
import type { CourseDetails, Session, SessionStatus, Slot, WeeklyClass } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar date as YYYY-MM-DD. */
export function isoDate(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function addDays(iso: string, days: number): string {
  const d = parseDate(iso)
  d.setDate(d.getDate() + days)
  return isoDate(d)
}

export function parseDate(iso: string, time = '00:00'): Date {
  const [y, m, d] = iso.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm)
}

/** 2026-10-01 -> "1 Oct 2026" */
export function formatDate(iso: string): string {
  return parseDate(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "10:00" -> "10:00 AM" */
export function formatTime(time: string): string {
  return parseDate('2000-01-01', time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function formatRange(s: Pick<Session, 'startTime' | 'endTime'>): string {
  return `${formatTime(s.startTime)} – ${formatTime(s.endTime)}`
}

export function formatClock(ts: Timestamp | Date | null, withSeconds = false): string {
  if (!ts) return '—'
  const d = ts instanceof Date ? ts : ts.toDate()
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  })
}

/** 24h HH:mm, used in tables and exports. */
export function formatClock24(ts: Timestamp | null): string {
  if (!ts) return ''
  const d = ts.toDate()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Attendance rate, or null when the number of expected participants is unknown. */
export function percent(present: number, expected: number | null): number | null {
  if (!expected || expected <= 0) return null
  return Math.min(100, Math.round((present / expected) * 1000) / 10)
}

export function formatPercent(p: number | null): string {
  return p === null ? '—' : `${p.toFixed(1)}%`
}

/** An active session whose QR window has lapsed is treated as ended everywhere in the UI. */
export function effectiveStatus(s: Pick<Session, 'status' | 'expiresAt'>, now = Date.now()): SessionStatus {
  if (s.status === 'active' && s.expiresAt && s.expiresAt.toMillis() <= now) return 'ended'
  return s.status
}

/** Dedupe key for a participant ID: "st 001" and "ST001" are the same person. */
export function studentKey(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9._-]/g, '-')
    .slice(0, 40)
}

// No 0/O/1/I/L: tokens get read aloud and typed by hand.
const TOKEN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function randomToken(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join('')
}

export function attendUrl(token: string): string {
  const base = (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.replace(/\/$/, '') || window.location.origin
  return `${base}/session/${token}`
}

/** Monday-first display order of Date.getDay() numbers. */
export const WEEK = [1, 2, 3, 4, 5, 6, 0]
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function formatDays(days: number[]): string {
  const sorted = WEEK.filter((d) => days.includes(d))
  if (sorted.length === 7) return t('Every day')
  if (sorted.join() === '1,2,3,4,5') return t('Weekdays')
  return sorted.map(dayShort).join(', ')
}

/** Whether a semester class is running on the given date (open-ended when dates are missing). */
export function inSemester(c: { startDate?: string | null; endDate?: string | null }, date: string): boolean {
  return (!c.startDate || c.startDate <= date) && (!c.endDate || c.endDate >= date)
}

/** A class's weekly meetings, whichever way it was stored. Sorted Monday-first, then by time. */
export function classSlots(c: Pick<WeeklyClass, 'slots' | 'days' | 'startTime' | 'endTime'>): Slot[] {
  const slots = c.slots?.length ? c.slots : c.days.map((day) => ({ day, startTime: c.startTime, endTime: c.endTime }))
  return [...slots].sort((a, b) => WEEK.indexOf(a.day) - WEEK.indexOf(b.day) || a.startTime.localeCompare(b.startTime))
}

export const KINDS = ['lecture', 'tutorial', 'lab'] as const
export const KIND_LABEL = { lecture: 'Lecture', tutorial: 'Tutorial', lab: 'Lab' } as const

/** "Lecture · SECJ3303 · Section 02 · N28 Lab 3" — only the parts that were filled in. */
export function courseLine(c: CourseDetails): string {
  return [c.kind && t(KIND_LABEL[c.kind]), c.code, c.section && `${t('Sec')} ${c.section}`, c.venue].filter(Boolean).join(' · ')
}

export const dayName = (d: number) => t(DAY_NAMES[d])
export const dayShort = (d: number) => t(DAY_NAMES[d].slice(0, 3))

/** Absent with a reason the university accepts: excused, or a medical certificate (MC). */
export const isAway = (status: string | undefined) => status === 'excused' || status === 'mc'

/** Records that count as "in the room": everything except an excused or MC absence. */
export const countPresent = (records: { status: string }[]) => records.filter((r) => !isAway(r.status)).length

/** One session per class meeting: the ID is fixed, so two devices cannot create two. */
export const classSessionId = (classId: string, date: string, slot: Slot) =>
  `${classId}_${date}_${slot.startTime.replace(':', '')}`

/** Identifies one meeting of a class: a date and a start time. */
export const meetingKey = (date: string, slot: Pick<Slot, 'startTime'>) => `${date}_${slot.startTime.replace(':', '')}`

/** Monday of the week that contains the given date. */
export function weekStart(iso: string): string {
  const day = parseDate(iso).getDay()
  return addDays(iso, -((day + 6) % 7))
}

/** After this many minutes past the start, a clock-in counts as late. */
export const LATE_GRACE_MIN = 10

/** Minutes late for a clock-in, or 0 when it was on time (within the grace period). */
export function minutesLate(clockIn: Timestamp | null | undefined, session: Pick<Session, 'date' | 'startTime'>): number {
  if (!clockIn) return 0
  const late = Math.floor((clockIn.toMillis() - parseDate(session.date, session.startTime).getTime()) / 60_000)
  return late > LATE_GRACE_MIN ? late : 0
}

/** 545 -> "9 h 05 min" */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
}
