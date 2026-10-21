import { createHmac } from 'node:crypto'

/**
 * Follow-up emails: a few emails that send themselves, each when it helps a customer take the next
 * step (run a first session, invite friends, try the feature made for them, come back). The wording
 * is edited in the Console; who gets which email, and when, is decided here. No imports from the
 * rest of the server, so it is tested on its own.
 */

export type Edition = 'lecturers' | 'trainers' | 'workplace'
export type Stage = 'firstSession' | 'invite' | 'tips' | 'quiet' | 'winback'

export interface Template {
  on: boolean
  subject: string
  heading: string
  /** Paragraphs, separated by a blank line. {name}, {organisation} and {invite} are filled in. */
  body: string
  button: string
  /** A path on the site, or {invite} for the person's invite link. */
  path: string
}

/** The stages, in the order a customer meets them, and when each one goes. */
export const STAGES: { id: Stage; when: string; perEdition: boolean }[] = [
  { id: 'firstSession', when: '1 day after signing up, if no session has been run', perEdition: true },
  { id: 'invite', when: 'Within 2 weeks of their first session', perEdition: true },
  { id: 'tips', when: '3 days after their first session', perEdition: true },
  { id: 'quiet', when: 'After 7 days without a session (they used Dobry on 2 or more days)', perEdition: true },
  { id: 'winback', when: 'After 30 days without a session', perEdition: true },
]

export const EDITIONS: Edition[] = ['lecturers', 'trainers', 'workplace']
export const editionOf = (purpose: unknown): Edition => (purpose === 'workplace' ? 'workplace' : purpose === 'training' || purpose === 'events' ? 'trainers' : 'lecturers')
/** The template behind a stage for this customer: firstSession.trainers, or invite. */
export const templateId = (stage: Stage, edition: Edition) => (STAGES.find((s) => s.id === stage)?.perEdition ? `${stage}.${edition}` : stage)

const p = (...lines: string[]) => lines.join('\n\n')

export const DEFAULT_TEMPLATES: Record<string, Template> = {
  // ---------- Lecturers ----------
  'firstSession.lecturers': {
    on: true,
    subject: 'Your first Dobry class takes 2 minutes',
    heading: 'Ready for your first class?',
    body: p(
      'Hello {name},',
      'Your Dobry account is ready, but no class has been run on it yet. The first one takes about two minutes to set up:',
      '1. Add your class and upload the student list from your portal’s export (Excel, CSV or PDF).\n2. At the start of class, tap Start and show the QR on the projector.\n3. Students scan it with their phone camera. Their names appear on your screen as they do.',
      'No app for students to install, and no sheet going round the hall.',
      'If anything gets in the way, reply to this email. A real person reads it.',
    ),
    button: 'Add your first class',
    path: '/app/new?weekly=1',
  },
  'invite.lecturers': {
    on: true,
    subject: 'Your first class is done. Here is how to get Pro free',
    heading: 'Nice work',
    body: p(
      'Hello {name},',
      'Your first class on Dobry is done, and the attendance is already on your report.',
      'Most lecturers know a few colleagues still passing a paper sheet round. Share your invite link with them. When 5 of them start using Dobry, you get Pro free for a month: up to 10 classes, export to your university portal, warning letters and the barring list. Every 5 more colleagues earn another month.',
      'Your invite link: {invite}',
      'It works best in your faculty’s WhatsApp group.',
    ),
    button: 'Share your invite link',
    path: '{invite}',
  },
  'tips.lecturers': {
    on: true,
    subject: 'Three things that save lecturers the most time',
    heading: 'Get more out of Dobry',
    body: p(
      'Hello {name},',
      'Now that your class is running on Dobry, these three save the most time over a semester:',
      '1. Export to your university portal. Set the format once (codes, dates, layout), then upload each week in one click instead of typing it in again.\n2. The 80% rule, worked out. Every student’s percentage, and how many more classes they can miss, updated after every class.\n3. Warning letters and the barring list. Dobry lists who is due a warning or barring and makes the letters as PDFs, ready to send.',
      'All three are on each class’s report page.',
    ),
    button: 'Open your reports',
    path: '/app/reports',
  },
  'quiet.lecturers': {
    on: true,
    subject: 'Did something get in the way?',
    heading: 'No classes on Dobry this week',
    body: p(
      'Hello {name},',
      'No class has been run on Dobry for a week. If it is a semester break or exam week, there is nothing to do.',
      'If something got in the way, a student who could not scan, a projector issue or a step that was not clear, reply and tell us. A real person reads it, and we fix things quickly.',
      'Your class lists and records are safe, ready for your next class.',
    ),
    button: 'Open Dobry',
    path: '/app',
  },
  'winback.lecturers': {
    on: true,
    subject: 'Ready for the new semester?',
    heading: 'Dobry is ready when you are',
    body: p(
      'Hello {name},',
      'It has been a while since your last class on Dobry. When the next semester starts, setting up takes a few minutes: upload the new class lists and you are ready.',
      'What is new since you last used it:',
      '• Certificates of attendance for workshops and short courses, which students can add to LinkedIn.\n• A head of department view of classes held and students at risk across courses.\n• The QR still changes every 45 seconds, so nobody signs in for a friend.',
      'Your past classes and reports are just as you left them.',
    ),
    button: 'Open Dobry',
    path: '/app',
  },

  // ---------- Trainers ----------
  'firstSession.trainers': {
    on: true,
    subject: 'Your first Dobry session takes 2 minutes',
    heading: 'Ready for your first session?',
    body: p(
      'Hello {name},',
      'Your Dobry account is ready, but no session has been run on it yet. The first one takes about two minutes:',
      '1. Add your course or workshop, with its dates. You can upload the participant list, or let people type their name.\n2. At the start, tap Start and show the QR on your laptop or the screen in the room.\n3. Participants scan it with their phone. Names appear on your screen as they arrive.',
      'For online sessions, participants type a short code from your screen instead.',
      'If anything gets in the way, reply to this email. A real person reads it.',
    ),
    button: 'Start a session',
    path: '/app/new',
  },
  'invite.trainers': {
    on: true,
    subject: 'Your first session is done. Here is how to get Pro free',
    heading: 'Nice work',
    body: p(
      'Hello {name},',
      'Your first session on Dobry is done, and the attendance is ready for your client.',
      'Know other trainers or training providers still using sign-in sheets? Share your invite link with them. When 5 of them start using Dobry, you get Pro free for a month: unlimited courses and every feature. Every 5 more earn another month.',
      'Your invite link: {invite}',
    ),
    button: 'Share your invite link',
    path: '{invite}',
  },
  'tips.trainers': {
    on: true,
    subject: 'Give every participant a certificate',
    heading: 'Certificates in one click',
    body: p(
      'Hello {name},',
      'When a course or workshop ends, Dobry can make a certificate of attendance for everyone who reached the attendance you set, with their hours. No more making them one by one in Canva or Word.',
      'Each certificate has its own link that anyone can open to check it is real, and a button that adds it to the participant’s LinkedIn profile.',
      'Open the course report, or a finished session, and choose Certificates. The course report also gives your client a clean attendance record, ready as Excel.',
    ),
    button: 'Make certificates',
    path: '/app/reports',
  },
  'quiet.trainers': {
    on: true,
    subject: 'Anything we can help with?',
    heading: 'No sessions on Dobry this week',
    body: p(
      'Hello {name},',
      'No session has been run on Dobry for a week. If you are between courses, there is nothing to do.',
      'If something got in the way, a participant who could not scan, an online session that did not work as expected, or a step that was not clear, reply and tell us. A real person reads it, and we fix things quickly.',
      'Your courses and records are safe, ready for your next session.',
    ),
    button: 'Open Dobry',
    path: '/app',
  },
  'winback.trainers': {
    on: true,
    subject: 'Running a course soon?',
    heading: 'Dobry is ready for your next course',
    body: p(
      'Hello {name},',
      'It has been a while since your last session on Dobry. For your next course or workshop, here is what is new:',
      '• Certificates of attendance in one click, with the hours and a link participants can add to LinkedIn.\n• A QR that changes every 45 seconds, so the attendance you give your client is real.\n• Live attendance and course reports, ready as Excel.',
      'Your past courses and records are just as you left them.',
    ),
    button: 'Open Dobry',
    path: '/app',
  },

  // ---------- Workplace ----------
  'firstSession.workplace': {
    on: true,
    subject: 'Get your staff clocking in tomorrow morning',
    heading: 'Ready for the first clock-in?',
    body: p(
      'Hello {name},',
      'Your Dobry account is ready, but nobody has clocked in yet. To have staff clocking in tomorrow morning:',
      '1. Set your working hours (or shifts).\n2. Upload your staff list from Excel, CSV or PDF.\n3. Open the door screen on any tablet or laptop at the entrance. Staff scan the QR with their own phone to clock in and out.',
      'No fingerprint machine to buy, and no app for staff to install.',
      'If anything gets in the way, reply to this email. A real person reads it.',
    ),
    button: 'Finish setting up',
    path: '/app',
  },
  'invite.workplace': {
    on: true,
    subject: 'Your team is clocking in. Here is how to get Pro free',
    heading: 'Nice work',
    body: p(
      'Hello {name},',
      'Your staff have started clocking in with Dobry.',
      'Know other business owners still using a punch card or fingerprint machine? Share your invite link with them. When 5 of them start using Dobry, you get Pro free for a month: more staff, several offices, shifts, overtime, leave, and pay with payslips. Every 5 more earn another month.',
      'Your invite link: {invite}',
    ),
    button: 'Share your invite link',
    path: '{invite}',
  },
  'tips.workplace': {
    on: true,
    subject: 'From clock-in to payslip',
    heading: 'Let Dobry work out pay',
    body: p(
      'Hello {name},',
      'Your staff are clocking in with Dobry. The same records can now work out pay.',
      'Enter each person’s salary once. Dobry works out overtime, rest-day and public holiday pay, allowances and deductions for absence from the clock-ins, and makes a payslip for each person.',
      'EPF, SOCSO, EIS and PCB stay with your accountant or payroll system; Dobry gives them clean figures.',
      'Open Pay in the menu to try it with this month’s attendance.',
    ),
    button: 'Open Pay',
    path: '/app/pay',
  },
  'quiet.workplace': {
    on: true,
    subject: 'Nobody has clocked in this week',
    heading: 'Is the door screen still on?',
    body: p(
      'Hello {name},',
      'Nobody has clocked in on Dobry for a week. Often it is simple: the tablet at the door went to sleep, lost Wi-Fi, or was unplugged.',
      'Open the door screen again on that tablet, or on any laptop, and staff can clock in straight away.',
      'If something else got in the way, reply and tell us. A real person reads it, and we fix things quickly.',
    ),
    button: 'Open the door screen',
    path: '/app/door',
  },
  'winback.workplace': {
    on: true,
    subject: 'What is new in Dobry for your team',
    heading: 'A few things have changed',
    body: p(
      'Hello {name},',
      'It has been a while since your staff clocked in with Dobry. Here is what is new:',
      '• Pay and payslips, worked out from the clock-ins.\n• One phone per person and a location check, so nobody clocks in for a friend.\n• Overtime, rest days and public holidays counted apart, for their own rates.',
      'Your staff list and past records are just as you left them. Open the door screen and you are running again.',
    ),
    button: 'Open Dobry',
    path: '/app',
  },
}

export interface GrowthSettings {
  /** The most follow-up emails sent in one day, to stay inside the email service's daily allowance. */
  dailyCap: number
  templates: Record<string, Template>
}

export const DEFAULT_SETTINGS: GrowthSettings = { dailyCap: 60, templates: DEFAULT_TEMPLATES }

const text = (v: unknown, max: number) => String(v ?? '').replace(/\r/g, '').slice(0, max)

/** Settings as saved or as sent by the Console, with anything missing taken from the defaults. */
export function tidySettings(raw: unknown): GrowthSettings {
  const r = (raw ?? {}) as Partial<GrowthSettings>
  const templates: Record<string, Template> = {}
  for (const [id, d] of Object.entries(DEFAULT_TEMPLATES)) {
    const t = (r.templates?.[id] ?? {}) as Partial<Template>
    templates[id] = {
      on: t.on === undefined ? d.on : Boolean(t.on),
      subject: text(t.subject, 150).trim() || d.subject,
      heading: text(t.heading, 150).trim() || d.heading,
      body: text(t.body, 4000).trim() || d.body,
      button: text(t.button, 60).trim(),
      path: text(t.path, 300).trim(),
    }
    if (t.button === undefined) templates[id].button = d.button
    if (t.path === undefined) templates[id].path = d.path
  }
  const cap = Math.round(Number(r.dailyCap))
  return { dailyCap: Number.isFinite(cap) ? Math.min(500, Math.max(0, cap)) : DEFAULT_SETTINGS.dailyCap, templates }
}

/** What is known about one customer when the daily job runs. Times in milliseconds. */
export interface Facts {
  createdAt: number | null
  /** First and last session with someone in it, within the window the job looks at. */
  first: number | null
  last: number | null
  /** Days with a session, within that window. */
  days: number
  /** When each follow-up last went to them. */
  emailed: Record<string, number>
  off: boolean
  suspended: boolean
}

const DAY = 86_400_000
/** How far back the daily job reads sessions. A first session is only trusted for newer accounts. */
export const WINDOW_DAYS = 75
/** No two follow-ups within this many days of each other. */
export const GAP_DAYS = 3

/** The follow-up a customer is due today, if any. At most one a day, never two within GAP_DAYS. */
export function due(f: Facts, now: number): Stage | null {
  if (f.off || f.suspended || !f.createdAt) return null
  const ago = (t: number | null | undefined) => (t ? now - t : Infinity)
  const lastAny = Math.max(0, ...Object.values(f.emailed))
  if (lastAny && now - lastAny < GAP_DAYS * DAY) return null
  const age = now - f.createdAt
  const sent = (k: Stage, within = Infinity) => ago(f.emailed[k]) < within

  if (!f.first) {
    if (age >= 1 * DAY && age < 7 * DAY && !sent('firstSession')) return 'firstSession'
    if (age >= 30 * DAY && age < 45 * DAY && !sent('winback', 90 * DAY)) return 'winback'
    return null
  }
  // The first session seen is the real first one only for an account younger than the window.
  const firstIsReal = age < WINDOW_DAYS * DAY
  if (firstIsReal && ago(f.first) < 14 * DAY && !sent('invite')) return 'invite'
  if (firstIsReal && ago(f.first) >= 3 * DAY && ago(f.first) < 21 * DAY && !sent('tips')) return 'tips'
  const quiet = ago(f.last)
  if (f.days >= 2 && quiet >= 7 * DAY && quiet < 14 * DAY && !sent('quiet', 60 * DAY)) return 'quiet'
  if (quiet >= 30 * DAY && quiet < 45 * DAY && !sent('winback', 90 * DAY)) return 'winback'
  return null
}

/** The template with this customer's details put in: paragraphs, and the button's link. */
export function fill(t: Template, values: { name?: string; organisation?: string; invite?: string }) {
  const first = values.name?.trim().split(/\s+/)[0] ?? ''
  const put = (s: string) =>
    s
      .replace(/Hello \{name\},/g, first ? `Hello ${first},` : 'Hello,')
      .replace(/\{name\}/g, first || 'there')
      .replace(/\{organisation\}/g, values.organisation?.trim() || 'your account')
      .replace(/\{invite\}/g, values.invite || 'https://dobry.app')
  return {
    subject: put(t.subject),
    heading: put(t.heading),
    lines: put(t.body).split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean),
    button: t.button && t.path ? { label: put(t.button), path: put(t.path) } : undefined,
  }
}

/** The proof in an unsubscribe link that it was made by Dobry for this organisation. */
export const unsubscribeToken = (secret: string, orgId: string) => createHmac('sha256', secret).update(`unsubscribe:${orgId}`).digest('hex').slice(0, 24)

/** Where a sign-up came from, as remembered by the browser, made safe to store. */
export function tidySource(raw: unknown): { source: string; medium: string; campaign: string; landing: string; referrer: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const s = (v: unknown, max = 60) => String(v ?? '').toLowerCase().replace(/[^a-z0-9._\-/ ]/g, '').trim().slice(0, max)
  const source = s(r.source) || 'direct'
  return { source, medium: s(r.medium), campaign: s(r.campaign, 80), landing: s(r.landing, 80), referrer: s(r.referrer, 80) }
}

/** Net Promoter Score from 0–10 answers: promoters (9–10) less detractors (0–6), as a whole percent. */
export function nps(scores: number[]): number | null {
  if (!scores.length) return null
  const promoters = scores.filter((s) => s >= 9).length
  const detractors = scores.filter((s) => s <= 6).length
  return Math.round(((promoters - detractors) / scores.length) * 100)
}
