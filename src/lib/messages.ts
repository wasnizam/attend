/**
 * Ready messages an organiser sends to the people in their session: students, participants or
 * staff. Dobry has no email address for them (it never asks for one), so the organiser sends these
 * themselves, on WhatsApp or anywhere else. Each edition has its own words.
 */
import { addDays, classSlots, dayName, formatDate, formatTime, inSemester, isoDate, meetingKey, parseDate } from './format'
import { t } from './i18n'
import { getPurpose } from './purpose'
import type { WeeklyClass } from './types'

export type MessageKind = 'before' | 'during' | 'after' | 'rule' | 'intro' | 'clockOut' | 'fix'

export interface MessageContext {
  /** The class, course or session name, with its code. */
  course: string
  date?: string
  startTime?: string
  endTime?: string
  venue?: string
  online?: boolean
  /** The check-in link, for an online session that is running. */
  link?: string
  /** The attendance a student must keep, in percent. */
  required?: number
}

export interface Message {
  kind: MessageKind
  label: string
  text: string
}

type Edition = 'lecturers' | 'trainers' | 'workplace'
const edition = (): Edition => {
  const p = getPurpose()
  return p === 'workplace' ? 'workplace' : p === 'training' || p === 'events' ? 'trainers' : 'lecturers'
}

/** "Thursday 23 Oct 2026, 9:00 AM – 11:00 AM" */
function when(c: MessageContext): string {
  if (!c.date) return ''
  const day = `${dayName(parseDate(c.date).getDay())} ${formatDate(c.date)}`
  return c.startTime && c.endTime ? `${day}, ${formatTime(c.startTime)} – ${formatTime(c.endTime)}` : day
}

/** The messages that fit this moment, in this edition. */
export function messagesFor(kinds: MessageKind[], c: MessageContext): Message[] {
  const ed = edition()
  const vars = { course: c.course, when: when(c), date: c.date ? formatDate(c.date) : t('today'), where: c.venue ? t(' at {venue}', { venue: c.venue }) : '', link: c.link ?? '', required: c.required ?? 80 }
  const out: Message[] = []
  for (const kind of kinds) {
    const pick = (label: string, text: string) => out.push({ kind, label: t(label), text: t(text, vars) })
    if (kind === 'before') {
      if (ed === 'lecturers')
        c.online
          ? pick('Reminder before class', 'Reminder: {course} is online on {when}. To mark your attendance, open the link I share in the meeting chat and type the code shown on my screen.')
          : pick('Reminder before class', 'Reminder: {course} is on {when}{where}. Attendance is taken by QR code: bring your phone, scan the code on the screen with your camera, and type your student ID. No app is needed.')
      else if (ed === 'trainers')
        c.online
          ? pick('Reminder before the session', 'Hello everyone. A reminder that {course} is online on {when}. To check in, open the link I share in the meeting chat and type the code shown on my screen.')
          : pick('Reminder before the session', 'Hello everyone. A reminder that {course} is on {when}{where}. Please bring your phone: you will check in by scanning a QR code at the start. No app is needed.')
    }
    if (kind === 'during') {
      if (c.online && c.link)
        pick('Attendance is open', ed === 'lecturers' ? 'Attendance for {course} is open now. Open {link} and type the code shown on my screen.' : 'Check-in for {course} is open now. Open {link} and type the code shown on my screen.')
      else
        pick('Attendance is open', ed === 'lecturers'
          ? 'Attendance for {course} is open now. Scan the QR code on the screen with your phone camera and type your student ID. The code changes every 45 seconds, so it only works in class.'
          : 'Check-in for {course} is open now. Scan the QR code on the screen with your phone camera and enter your details. The code changes every 45 seconds, so it only works in the room.')
    }
    if (kind === 'after') {
      if (ed === 'lecturers') pick('After class', 'Attendance for {course} on {date} is recorded. If you attended but are not on the list, or you were absent with a valid reason such as an MC, see me within 3 days with the evidence.')
      else if (ed === 'trainers') pick('Thank you after the session', 'Thank you for attending {course}. Your attendance is recorded. Everyone who completes the course will receive a certificate of attendance with its own link, which you can add to LinkedIn.')
    }
    if (kind === 'rule' && ed === 'lecturers') pick('The attendance rule', 'A reminder that you must attend at least {required}% of the classes of {course} to sit the final examination. Absences with a valid reason, such as an MC, do not count against you if you give me the evidence.')
    if (kind === 'intro' && ed === 'workplace') pick('Tell staff how to clock in', 'From {date}, we clock in and out with Dobry. There is a screen with a QR code at the entrance. When you arrive and when you leave, scan it with your phone camera and type your staff ID. There is no app to install. Please use your own phone: each phone clocks in one person.')
    if (kind === 'clockOut' && ed === 'workplace') pick('Reminder to clock out', 'A reminder to scan the QR code at the entrance when you leave today, so your hours and overtime are counted.')
    if (kind === 'fix' && ed === 'workplace') pick('Fix missing clock-ins', 'If you forgot to clock in or out this week, tell me by {date} so it can be corrected before payroll.')
  }
  return out
}

/** The next time a semester class meets, from today on (within three weeks), if there is one. */
export function nextMeeting(cls: WeeklyClass, today = isoDate()): { date: string; startTime: string; endTime: string } | null {
  for (let i = 0; i < 21; i++) {
    const date = addDays(today, i)
    if (!inSemester(cls, date)) continue
    const day = parseDate(date).getDay()
    for (const slot of classSlots(cls)) {
      if (slot.day === day && !cls.cancelled?.[meetingKey(date, slot)]) return { date, startTime: slot.startTime, endTime: slot.endTime }
    }
  }
  return null
}

/** A share link that opens WhatsApp with the message written in, for the organiser to pick the chat. */
export const whatsappLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`
