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
  { id: 'invite', when: 'Within 2 weeks of their first session', perEdition: false },
  { id: 'tips', when: '3 days after their first session', perEdition: true },
  { id: 'quiet', when: 'After 7 days without a session (they used Dobry on 2 or more days)', perEdition: false },
  { id: 'winback', when: 'After 30 days without a session', perEdition: false },
]

export const EDITIONS: Edition[] = ['lecturers', 'trainers', 'workplace']
export const editionOf = (purpose: unknown): Edition => (purpose === 'workplace' ? 'workplace' : purpose === 'training' || purpose === 'events' ? 'trainers' : 'lecturers')
/** The template behind a stage for this customer: firstSession.trainers, or invite. */
export const templateId = (stage: Stage, edition: Edition) => (STAGES.find((s) => s.id === stage)?.perEdition ? `${stage}.${edition}` : stage)

const p = (...lines: string[]) => lines.join('\n\n')

export const DEFAULT_TEMPLATES: Record<string, Template> = {
  'firstSession.lecturers': {
    on: true,
    subject: 'Your first Dobry class takes 2 minutes',
    heading: 'Ready for your first class?',
    body: p(
      'Hello {name},',
      'Your Dobry account is ready. The first class takes about two minutes to set up:',
      '1. Add a class and upload its student list from your portal’s export.\n2. Start a session and show the QR on the projector.\n3. Students scan it with their phone camera, and the list fills itself.',
      'Reply to this email if anything gets in the way. A real person reads it.',
    ),
    button: 'Add your first class',
    path: '/app/new?weekly=1',
  },
  'firstSession.trainers': {
    on: true,
    subject: 'Your first Dobry session takes 2 minutes',
    heading: 'Ready for your first session?',
    body: p(
      'Hello {name},',
      'Your Dobry account is ready. Your first session takes about two minutes:',
      '1. Add your course or workshop.\n2. Start the session and show the QR on your laptop or the screen in the room.\n3. Participants scan it with their phone. Names appear on your screen as they arrive.',
      'After the course, one click makes a certificate of attendance for everyone who came.',
      'Reply to this email if anything gets in the way. A real person reads it.',
    ),
    button: 'Start a session',
    path: '/app/new',
  },
  'firstSession.workplace': {
    on: true,
    subject: 'Get your staff clocking in tomorrow morning',
    heading: 'Ready for the first clock-in?',
    body: p(
      'Hello {name},',
      'Your Dobry account is ready. To have staff clocking in tomorrow:',
      '1. Set your working hours.\n2. Upload your staff list from Excel, CSV or PDF.\n3. Open the door screen on any tablet or laptop at the entrance. Staff scan the QR with their own phone.',
      'Reply to this email if anything gets in the way. A real person reads it.',
    ),
    button: 'Finish setting up',
    path: '/app',
  },
  invite: {
    on: true,
    subject: 'Nice work. Here is how to get Pro free',
    heading: 'Your first session is done',
    body: p(
      'Hello {name},',
      'Your first Dobry session is in the books. Well done.',
      'Know colleagues who still pass a paper sheet round? Invite 5 of them. When they start using Dobry, you get Pro free for a month, and every 5 more friends earn another month.',
      'Your invite link: {invite}',
    ),
    button: 'Share your invite link',
    path: '{invite}',
  },
  'tips.lecturers': {
    on: true,
    subject: 'Three things lecturers do with Dobry',
    heading: 'Get more out of Dobry',
    body: p(
      'Hello {name},',
      'Now that your class is running on Dobry, three things save the most time:',
      '1. Export to your university portal: set the format once, then upload in one click.\n2. The 80% rule: every student’s percentage and how many classes they can still miss, after every class.\n3. Warning letters and the barring list, made for you as PDFs.',
      'All three are on each class’s report page.',
    ),
    button: 'Open your reports',
    path: '/app/reports',
  },
  'tips.trainers': {
    on: true,
    subject: 'Give your participants a certificate',
    heading: 'Certificates in one click',
    body: p(
      'Hello {name},',
      'When a course or workshop ends, Dobry can make a certificate of attendance for everyone who reached the attendance you set, with their hours.',
      'Each certificate has its own link that anyone can open to check it is real, and participants can add it to LinkedIn.',
      'Open the course report, or a finished session, and choose Certificates.',
    ),
    button: 'Open your reports',
    path: '/app/reports',
  },
  'tips.workplace': {
    on: true,
    subject: 'From clock-in to payslip',
    heading: 'Let Dobry work out pay',
    body: p(
      'Hello {name},',
      'Your staff are clocking in with Dobry. The same records can work out pay: enter each salary once, and overtime, rest-day and holiday pay, allowances and deductions for absence are worked out for you, with a payslip for each person.',
      'Open Pay in the menu to try it with this month’s attendance.',
    ),
    button: 'Open Pay',
    path: '/app/pay',
  },
  quiet: {
    on: true,
    subject: 'Need a hand with Dobry?',
    heading: 'We have not seen you for a week',
    body: p(
      'Hello {name},',
      'No session has been run on Dobry for a week. If something got in the way, a slow screen, a confusing step or students who could not scan, reply and tell us. A real person reads it, and we fix things fast.',
      'If it was just a quiet week, nothing to do. Your records are safe.',
    ),
    button: 'Open Dobry',
    path: '/app',
  },
  winback: {
    on: true,
    subject: 'What is new in Dobry',
    heading: 'A few things have changed',
    body: p(
      'Hello {name},',
      'It has been a while since you used Dobry, so here is what is new:',
      '• Certificates of attendance in one click, with a link to add them to LinkedIn.\n• Pay and payslips worked out from staff attendance.\n• A QR that changes every 45 seconds, so nobody checks in for a friend.',
      'Your account and records are just as you left them.',
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
