import { randomInt } from 'node:crypto'

/**
 * Certificates of attendance. The figures on a certificate are worked out here, on the server,
 * from the attendance records themselves, so what the public check page shows is what Dobry
 * recorded, not what a browser said.
 */

/** Letters and numbers that cannot be mistaken for each other when typed from paper. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 8

export const newCode = () => Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')

/** A code as typed or read from a link: upper case, without spaces or dashes. Empty when it cannot be one. */
export function tidyCode(raw: unknown): string {
  const code = String(raw ?? '').toUpperCase().replace(/[\s-]/g, '')
  return code.length === CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c)) ? code : ''
}

/** Text typed by the organiser, kept to one tidy line. */
export const tidyText = (raw: unknown, max: number) => String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

const minutesOf = (time: string) => {
  const [h, m] = time.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** How long a session lasts, in hours, from its start and end times. A session past midnight ends the next day. */
export function sessionHours(s: { startTime?: string; endTime?: string }): number {
  if (!s.startTime || !s.endTime) return 0
  let minutes = minutesOf(s.endTime) - minutesOf(s.startTime)
  if (minutes <= 0) minutes += 24 * 60
  return minutes / 60
}

export interface HeldSession {
  id: string
  date: string
  startTime?: string
  endTime?: string
}

export interface Mark {
  sessionId: string
  studentKey: string
  studentName?: string
  studentId?: string
  status?: string
}

export interface Tally {
  key: string
  name: string
  /** Sessions attended (present or late). */
  attended: number
  /** Sessions that count for them: those held, less any they were excused from. */
  counted: number
  hours: number
  /** Attendance in whole percent, or null when nothing counts. */
  rate: number | null
  /** First and last day they attended. */
  from: string
  to: string
}

/** Each person's attendance over the sessions held, the same way the reports count it. */
export function tally(held: HeldSession[], marks: Mark[]): Map<string, Tally> {
  const byId = new Map(held.map((s) => [s.id, s]))
  const out = new Map<string, Tally>()
  for (const m of marks) {
    const s = byId.get(m.sessionId)
    if (!s || !m.studentKey) continue
    const row = out.get(m.studentKey) ?? { key: m.studentKey, name: '', attended: 0, counted: held.length, hours: 0, rate: null, from: '', to: '' }
    if (m.studentName) row.name = m.studentName
    const status = m.status ?? 'present'
    if (status === 'excused' || status === 'mc') row.counted -= 1
    else {
      row.attended += 1
      row.hours += sessionHours(s)
      if (!row.from || s.date < row.from) row.from = s.date
      if (!row.to || s.date > row.to) row.to = s.date
    }
    out.set(m.studentKey, row)
  }
  for (const row of out.values()) {
    row.rate = row.counted > 0 ? Math.round((row.attended / row.counted) * 100) : null
    row.hours = Math.round(row.hours * 10) / 10
  }
  return out
}

/** Whether a person has earned a certificate under the organiser's minimum attendance. */
export const earns = (row: Tally, min: number) => row.attended > 0 && row.rate !== null && row.rate >= min

/** What anyone with the link may see. Nothing that identifies the person beyond their name. */
export interface PublicCertificate {
  code: string
  name: string
  course: string
  issuer: string
  signedBy: string
  from: string
  to: string
  hours: number
  sessions: number
  rate: number | null
  issuedAt: number
  revoked: boolean
}
