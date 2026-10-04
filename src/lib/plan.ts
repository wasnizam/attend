import { type Purpose, getPurpose } from './purpose'

/**
 * Payment is not connected yet. While this is false every new organisation is created on
 * `early` (everything open). Turn it on together with the payment gateway: from then on a
 * new organisation starts a 14-day Pro trial and drops to Free when it ends.
 */
export const PAYMENTS_OPEN = false
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
  /** Workplace Pro: how many staff the paid tier covers. */
  seats?: number
}

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

/** Whole days left of the Pro trial, or null when not on one. */
export function trialDaysLeft(now = Date.now()): number | null {
  if (activePlan(now) !== 'trial' || !fields.trialStarted) return null
  return Math.max(1, Math.ceil((fields.trialStarted.toMillis() + TRIAL_DAYS * DAY - now) / DAY))
}

export const paidUntil = () => (activePlan() === 'pro' ? fields.paidUntil ?? null : null)

/** The most classes, or people on one list, the current plan allows. Undefined = no limit. */
export function limitFor(kind: 'classes' | 'staff'): number | undefined {
  const active = activePlan()
  if (active === 'free') return FREE_LIMIT[getPurpose()][kind]
  // Paid workplace plans are sold by size.
  if (active === 'pro' && kind === 'staff' && getPurpose() === 'workplace') return fields.seats
  return undefined
}

export function overLimit(kind: 'classes' | 'staff', count: number): boolean {
  const max = limitFor(kind)
  return max !== undefined && count > max
}
