import { type Purpose, getPurpose } from './purpose'

/**
 * Whether customers can pay. Set by VITE_PAYMENTS_OPEN=true when the site is built (in Vercel's
 * settings), together with the payment keys. While it is off every new organisation is created
 * on its edition's starting plan and no Upgrade button works; once on, a new organisation
 * starts a 14-day Pro trial and drops to Free when it ends.
 */
export const PAYMENTS_OPEN = import.meta.env.VITE_PAYMENTS_OPEN === 'true'

const PAY_TEST = 'attend.payTest'

/**
 * Whether this browser may start a payment. Before payments open for everyone, opening the
 * Account page with ?pay=test switches it on for this browser only, to try the whole flow.
 */
export function canPay(): boolean {
  if (PAYMENTS_OPEN) return true
  try {
    if (new URLSearchParams(window.location.search).get('pay') === 'test') localStorage.setItem(PAY_TEST, '1')
    return localStorage.getItem(PAY_TEST) === '1'
  } catch {
    return false
  }
}
export const TRIAL_DAYS = 14

/**
 * What is stored on the organisation. `early` = joined before payment opened, no limits.
 * `trial` = Pro until 14 days after `trialStarted`. `pro` = paid, until `paidUntil`.
 * Only the server side (the payment webhook) may set `pro`, `paidUntil` or `seats`.
 */
export type Plan = 'early' | 'trial' | 'free' | 'pro'

/** What applies right now, once dates are taken into account. */
export type ActivePlan = 'early' | 'trial' | 'free' | 'pro'

export const PLAN_LABEL: Record<ActivePlan, string> = { early: 'Early access', trial: 'Pro trial', free: 'Free', pro: 'Pro' }

interface Stamp {
  toMillis(): number
}
export interface PlanFields {
  plan?: Plan
  trialStarted?: Stamp | null
  paidUntil?: Stamp | null
  /** Workplace Pro: how many staff the paid tier covers. Lecturers: how many lecturers (Faculty); none means one. */
  seats?: number
}

/**
 * Lecturers: what one lecturer may hold. Pro is one lecturer's plan, so its limits are ones a
 * lecturer does not reach but a whole college sharing one account does.
 */
export const LECTURER_LIMIT = { free: { classes: 1, students: 60 }, pro: { classes: 10, students: 300 } }

/** What the free plan allows. Missing means no limit. */
const FREE_LIMIT: Record<Purpose, { classes?: number; staff?: number }> = {
  education: { classes: 1 },
  training: { classes: 1 },
  workplace: { staff: 5 },
  events: {},
}

const DAY = 86_400_000
let fields: PlanFields = {}

export const setPlan = (org: PlanFields | null | undefined) => {
  fields = org ?? {}
}

export function activePlan(now = Date.now()): ActivePlan {
  return planOf(fields, now).active
}

/** Any organisation's plan right now, and when it ends (trial end or paid-until). */
export function planOf(org: PlanFields, now = Date.now()): { active: ActivePlan; until: number | null; lapsed: boolean } {
  const { plan, trialStarted, paidUntil } = org
  if (plan === 'pro') {
    const until = paidUntil?.toMillis() ?? null
    return until && until > now ? { active: 'pro', until, lapsed: false } : { active: 'free', until, lapsed: true }
  }
  if (plan === 'trial') {
    const until = trialStarted ? trialStarted.toMillis() + TRIAL_DAYS * DAY : null
    return until && until > now ? { active: 'trial', until, lapsed: false } : { active: 'free', until, lapsed: true }
  }
  return { active: plan === 'free' ? 'free' : 'early', until: null, lapsed: false }
}

/** What only paid plans include. A workplace is held back from all eight; a lecturer from PDF and export. */
export type Feature = 'pdf' | 'export' | 'overtime' | 'leave' | 'offices' | 'shifts' | 'geofence' | 'phoneCheck'

/**
 * Whether the free plan's limits are being applied: only once customers can pay (or in a browser
 * trying payments out), so nobody is locked out of something with no way to get it back.
 */
export const locksOn = () => canPay()

/**
 * Whether the organisation's plan includes a feature. On the free plan a workplace is held back
 * from all of them, and a lecturer from downloads (PDF reports and letters, export to the
 * university system and to Excel). Trainers get every feature on any plan.
 */
export function allows(feature: Feature): boolean {
  if (!locksOn() || activePlan() !== 'free') return true
  const purpose = getPurpose()
  if (purpose === 'workplace') return false
  if (purpose === 'education') return feature !== 'pdf' && feature !== 'export'
  return true
}

/** Whole days left of the Pro trial, or null when not on one. */
export function trialDaysLeft(now = Date.now()): number | null {
  if (activePlan(now) !== 'trial' || !fields.trialStarted) return null
  return Math.max(1, Math.ceil((fields.trialStarted.toMillis() + TRIAL_DAYS * DAY - now) / DAY))
}

export const paidUntil = () => (activePlan() === 'pro' ? fields.paidUntil ?? null : null)

export type Limit = 'classes' | 'staff' | 'students' | 'lecturers'

/**
 * The most the current plan allows: classes one person runs at a time, people on a workplace's
 * lists, students on one class list, or lecturers in the organisation. Undefined = no limit.
 */
export function limitFor(kind: Limit): number | undefined {
  const active = activePlan()
  const purpose = getPurpose()
  if (active === 'early') return undefined
  if (purpose === 'education') {
    const paid = active === 'pro' || active === 'trial'
    if (kind === 'classes') return paid ? LECTURER_LIMIT.pro.classes : LECTURER_LIMIT.free.classes
    // New with the paid plans, so held back until there is a way to pay.
    if (kind === 'students') return paid ? LECTURER_LIMIT.pro.students : locksOn() ? LECTURER_LIMIT.free.students : undefined
    // A trial may bring colleagues in to try the Faculty plan.
    if (kind === 'lecturers') return active === 'pro' ? Math.max(1, fields.seats ?? 1) : active === 'free' && locksOn() ? 1 : undefined
    return undefined
  }
  if (kind === 'students' || kind === 'lecturers') return undefined
  // A free workplace has one office with one shift, once the limits apply.
  if (active === 'free' && kind === 'classes' && purpose === 'workplace') return locksOn() ? 1 : undefined
  if (active === 'free') return FREE_LIMIT[purpose][kind]
  // Paid workplace plans are sold by size.
  if (active === 'pro' && kind === 'staff' && purpose === 'workplace') return fields.seats
  return undefined
}

export function overLimit(kind: Limit, count: number): boolean {
  const max = limitFor(kind)
  return max !== undefined && count > max
}
