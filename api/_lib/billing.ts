/**
 * What a customer is charged, worked out on the server from the price list (so a price can never
 * be changed from the browser), and what a Stripe subscription means for their organisation.
 * No imports: this file is plain logic, tested on its own.
 */
export type EditionId = 'lecturers' | 'trainers' | 'workplace'
export type Cycle = 'free' | 'month' | 'semester' | 'year'
export type Currency = 'myr' | 'usd'

export interface CatalogPlan {
  id: string
  name: string
  priceMyr: number
  priceUsd: number
  cycle: Cycle
  seats?: number
  /** Lecturers: the price is for each lecturer, from `minSeats` lecturers up (the Faculty plan). */
  perSeat?: boolean
  minSeats?: number
  /** The line under the price; one that offers a year ("Or RM390 a year") is what allows yearly payment. */
  noteMyr?: string
  noteUsd?: string
  hidden?: boolean
}
export type Catalog = Record<EditionId, CatalogPlan[]>

export interface Discount {
  kind: 'percent' | 'amount'
  value: number
  until?: string
}

/** A plan sold by the month can be paid by the year when its price note offers it: twelve months for the price of ten. */
export const YEAR_PAYS_FOR = 10

/** Whether a plan may be paid by the year. The website offers it for exactly the same plans. */
export const offersYear = (plan: Pick<CatalogPlan, 'cycle' | 'noteMyr' | 'noteUsd'>) => plan.cycle === 'month' && /year/i.test(`${plan.noteMyr ?? ''} ${plan.noteUsd ?? ''}`)

/** What a customer sees on their bank statement for a Dobry payment (5 to 22 letters). */
export const STATEMENT_NAME = 'DOBRY'

export const editionOf = (purpose: string | undefined): EditionId => (purpose === 'workplace' ? 'workplace' : purpose === 'training' ? 'trainers' : 'lecturers')

const EDITION_NAME: Record<EditionId, string> = { lecturers: 'Lecturers', trainers: 'Trainers', workplace: 'Workplace' }

export interface Charge {
  /** Stripe product ID: one per plan, so reports in Stripe group by plan. */
  productId: string
  productName: string
  /** In the smallest unit of the currency (sen, cents), after any standing discount. */
  unitAmount: number
  /** The list price in whole units, before the discount, for the customer record. */
  listAmount: number
  currency: Currency
  cycle: 'month' | 'semester' | 'year'
  interval: 'month' | 'year'
  intervalCount: number
  /** Workplace: staff covered (0 = no limit). Lecturers: lecturers covered (0 = one). */
  seats: number
  /** How many are paid for: lecturers on a plan priced per lecturer, otherwise 1. */
  quantity: number
}

/** The most lecturers one faculty can pay for online. */
export const MAX_SEATS = 500

export class BillingError extends Error {}

const discountLive = (d: Discount | null | undefined, today: string): d is Discount => Boolean(d && d.value > 0 && (!d.until || d.until >= today))

/** The charge for one plan. Throws a BillingError with a message fit to show the customer. */
export function chargeFor(
  catalog: Catalog,
  purpose: string | undefined,
  planId: string,
  currency: Currency,
  yearly: boolean,
  discount: Discount | null | undefined,
  today: string,
  /** Lecturers wanted, for a plan priced per lecturer. */
  wanted = 1,
): Charge {
  const edition = editionOf(purpose)
  const plan = (catalog[edition] ?? []).find((p) => p.id === planId)
  if (!plan || plan.hidden) throw new BillingError('That plan is not available.')
  if (plan.cycle === 'free') throw new BillingError('The free plan needs no payment.')
  const base = currency === 'myr' ? plan.priceMyr : plan.priceUsd
  if (!(base > 0)) throw new BillingError('That plan has no price in this currency.')
  if (yearly && !offersYear(plan)) throw new BillingError('This plan cannot be paid by the year.')

  const least = Math.max(1, Math.floor(plan.minSeats ?? 1))
  const quantity = plan.perSeat ? Math.floor(Number(wanted) || 0) : 1
  if (plan.perSeat && quantity < least) throw new BillingError(`This plan starts from ${least} lecturers.`)
  if (quantity > MAX_SEATS) throw new BillingError(`For more than ${MAX_SEATS} lecturers, contact Dobry.`)

  const cycle = yearly ? 'year' : plan.cycle
  // Each one's price; a discount is taken off each, so the total is always a whole number of sen.
  const listAmount = yearly ? base * YEAR_PAYS_FOR : base
  const charged = !discountLive(discount, today)
    ? listAmount
    : Math.max(0, discount.kind === 'percent' ? listAmount * (1 - Math.min(100, discount.value) / 100) : listAmount - discount.value)
  const unitAmount = Math.round(charged * 100)
  if (unitAmount < 50) throw new BillingError('This plan is already covered by your discount. Contact Dobry to switch it on.')
  return {
    productId: `dobry_${edition}_${plan.id}`.replace(/[^A-Za-z0-9_-]/g, '_'),
    productName: `Dobry ${EDITION_NAME[edition]} · ${plan.name}`,
    unitAmount,
    listAmount: listAmount * quantity,
    currency,
    cycle,
    interval: cycle === 'year' ? 'year' : 'month',
    intervalCount: cycle === 'semester' ? 6 : 1,
    seats: edition === 'workplace' ? Math.max(0, Math.floor(plan.seats ?? 0)) : plan.perSeat ? quantity : 0,
    quantity,
  }
}

/** What goes on the Stripe subscription, so the listener knows whose it is and what it buys. */
export const subscriptionMetadata = (orgId: string, planId: string, c: Charge): Record<string, string> => ({
  orgId,
  planId,
  seats: String(c.seats),
  listAmount: String(c.listAmount),
  cycle: c.cycle,
})

/** A few days after the paid period ends before Pro is taken away, while Stripe retries a failed card. */
export const GRACE_DAYS = 3

export interface SubscriptionFacts {
  id: string
  status: string
  /** Unix seconds. */
  periodEnd: number | null
  currency: string
  metadata: Record<string, string | undefined>
}

export interface OrgPlanPatch {
  plan: 'pro' | 'free'
  /** Milliseconds; null takes Pro away now. */
  paidUntil: number | null
  /** Null clears the limit. */
  seats: number | null
  price: { amount: number; currency: 'MYR' | 'USD'; cycle: 'month' | 'semester' | 'year' } | null
  stripeSubscriptionId: string | null
  stripeStatus: string
  planId: string | null
}

/** What an organisation has, given its subscription as Stripe reports it now. */
export function patchFromSubscription(sub: SubscriptionFacts): OrgPlanPatch {
  const live = sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due'
  if (!live || !sub.periodEnd) {
    return { plan: 'free', paidUntil: null, seats: null, price: null, stripeSubscriptionId: null, stripeStatus: sub.status, planId: null }
  }
  const seats = Number(sub.metadata.seats ?? 0)
  const amount = Number(sub.metadata.listAmount ?? 0)
  const cycle = sub.metadata.cycle === 'year' || sub.metadata.cycle === 'semester' ? sub.metadata.cycle : 'month'
  return {
    plan: 'pro',
    paidUntil: sub.periodEnd * 1000 + GRACE_DAYS * 86_400_000,
    seats: seats > 0 ? seats : null,
    price: amount > 0 ? { amount, currency: sub.currency.toLowerCase() === 'myr' ? 'MYR' : 'USD', cycle } : null,
    stripeSubscriptionId: sub.id,
    stripeStatus: sub.status,
    planId: sub.metadata.planId ?? null,
  }
}
