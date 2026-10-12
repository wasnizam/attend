import { type Limit, type PlanLimits, planLimits } from '../lib/plan'
import type { Organisation, UserProfile, WeeklyClass } from '../lib/types'

/**
 * How much of its plan each customer is using: who holds more than they pay for, and who is
 * close enough to be worth a word about upgrading. Plain logic, tested on its own.
 */
export interface LimitRow {
  kind: Exclude<Limit, 'sessions'>
  used: number
  max: number
  /** Whose number it is: the lecturer with the most classes, the biggest class. */
  who?: string
  state: 'over' | 'full' | 'near' | 'ok'
}

export type Standing = 'over' | 'near' | 'ok' | 'none'

const stateOf = (used: number, max: number): LimitRow['state'] => (used > max ? 'over' : used === max ? 'full' : max >= 5 && used >= max * 0.8 ? 'near' : 'ok')

/** What an organisation uses of each thing its plan limits. Rows only for limits the plan has. */
export function limitRows(org: Organisation, users: UserProfile[], classes: WeeklyClass[], today: string, now = Date.now()): LimitRow[] {
  const limits: PlanLimits = planLimits(org, now)
  const mine = classes.filter((c) => c.organisationId === org.id)
  const running = mine.filter((c) => !c.endDate || c.endDate >= today)
  const rows: LimitRow[] = []
  const add = (kind: LimitRow['kind'], used: number, who?: string) => {
    const max = limits[kind]
    if (max !== undefined) rows.push({ kind, used, max, who, state: stateOf(used, max) })
  }
  // The server's own count where it has one; otherwise what can be seen from here.
  add('lecturers', org.usage?.lecturers ?? users.filter((u) => u.organisationId === org.id && u.status === 'active').length)
  add('staff', org.usage?.staff ?? mine.filter((c) => !c.rosterFrom).reduce((n, c) => n + (c.rosterCount ?? 0), 0))
  // Classes are counted for each person: the plan is held to whoever runs the most.
  const perOwner = new Map<string, { n: number; name: string }>()
  for (const c of running) perOwner.set(c.ownerId, { n: (perOwner.get(c.ownerId)?.n ?? 0) + 1, name: c.ownerName })
  const busiest = [...perOwner.values()].sort((a, b) => b.n - a.n)[0]
  add('classes', busiest?.n ?? 0, busiest?.name)
  const biggest = [...running].sort((a, b) => (b.rosterCount ?? 0) - (a.rosterCount ?? 0))[0]
  add('students', biggest?.rosterCount ?? 0, biggest ? [biggest.code, biggest.name].filter(Boolean).join(' ') : undefined)
  return rows
}

/** One word for the customer as a whole: over their plan, near it, within it, or no limits at all. */
export const standingOf = (rows: LimitRow[]): Standing =>
  rows.length === 0 ? 'none' : rows.some((r) => r.state === 'over') ? 'over' : rows.some((r) => r.state === 'full' || r.state === 'near') ? 'near' : 'ok'
