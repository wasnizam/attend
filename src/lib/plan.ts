import { type Purpose, getPurpose } from './purpose'

/**
 * What an organisation is paying for. `early` is the launch period: everything is open.
 * `free` has the limits below; `pro` has none. Only the server side may change a plan.
 */
export type Plan = 'early' | 'free' | 'pro'

export const PLAN_LABEL: Record<Plan, string> = { early: 'Early access', free: 'Free', pro: 'Pro' }

/** What the free plan allows. Missing means no limit. */
const FREE_LIMIT: Record<Purpose, { classes?: number; staff?: number }> = {
  education: { classes: 1 },
  training: { classes: 1 },
  workplace: { staff: 5 },
  events: {},
}

let plan: Plan = 'early'

export const getPlan = () => plan
export const setPlan = (next: Plan | undefined | null) => {
  plan = next === 'free' || next === 'pro' ? next : 'early'
}

/** True when the free plan does not allow this many classes (or people on one list). */
export function overLimit(kind: 'classes' | 'staff', count: number): boolean {
  if (plan !== 'free') return false
  const max = FREE_LIMIT[getPurpose()][kind]
  return max !== undefined && count > max
}
