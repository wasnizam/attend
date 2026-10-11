import { describe, expect, it } from 'vitest'
import { BillingError, GRACE_DAYS, chargeFor, offersYear, patchFromSubscription, subscriptionMetadata } from '../api/_lib/billing'
import { DEFAULT_CATALOG } from '../api/_lib/catalog.default'
import { defaultCatalog, offersYear as offersYearOnSite } from '../src/lib/pricing'

const today = '2026-10-08'
const charge = (purpose: string, planId: string, currency: 'myr' | 'usd', yearly = false, discount: Parameters<typeof chargeFor>[5] = null) =>
  chargeFor(DEFAULT_CATALOG, purpose, planId, currency, yearly, discount, today)

describe('the payment server’s price list', () => {
  it('is the same as the one the website shows', () => {
    const site = defaultCatalog()
    for (const edition of ['lecturers', 'trainers', 'workplace'] as const) {
      expect(DEFAULT_CATALOG[edition].map((p) => [p.id, p.name, p.priceMyr, p.priceUsd, p.cycle, p.seats ?? 0, p.noteMyr ?? '', p.noteUsd ?? '', p.perSeat ? p.minSeats : 0])).toEqual(
        site[edition].map((p) => [p.id, p.name, p.priceMyr, p.priceUsd, p.cycle, p.seats ?? 0, p.noteMyr ?? '', p.noteUsd ?? '', p.perSeat ? p.minSeats : 0]),
      )
    }
  })

  it('offers yearly payment for exactly the plans the website does', () => {
    for (const plans of Object.values(defaultCatalog())) for (const p of plans) expect(offersYear(p)).toBe(offersYearOnSite(p))
    expect(offersYear(DEFAULT_CATALOG.trainers[1])).toBe(true)
    expect(offersYear(DEFAULT_CATALOG.workplace[1])).toBe(false)
  })
})

describe('what a customer is charged', () => {
  it('charges a workplace plan by the month, in sen or cents, with its staff limit', () => {
    expect(charge('workplace', 'workplace-1', 'myr')).toMatchObject({ unitAmount: 4900, currency: 'myr', interval: 'month', intervalCount: 1, seats: 20, cycle: 'month', productId: 'dobry_workplace_workplace-1' })
    expect(charge('workplace', 'workplace-3', 'usd')).toMatchObject({ unitAmount: 4500, currency: 'usd', seats: 100 })
  })

  it('charges one lecturer by the month, or by the year for the price of ten months', () => {
    expect(charge('education', 'lecturers-1', 'myr')).toMatchObject({ unitAmount: 1900, interval: 'month', intervalCount: 1, cycle: 'month', seats: 0, quantity: 1 })
    expect(charge('education', 'lecturers-1', 'usd', true)).toMatchObject({ unitAmount: 5000, listAmount: 50, interval: 'year', cycle: 'year', quantity: 1 })
  })

  it('charges a faculty for each lecturer, from five up', () => {
    const faculty = (n: number, yearly = false) => chargeFor(DEFAULT_CATALOG, 'education', 'lecturers-2', 'myr', yearly, null, today, n)
    expect(faculty(5)).toMatchObject({ unitAmount: 1500, quantity: 5, seats: 5, listAmount: 75, cycle: 'month', productId: 'dobry_lecturers_lecturers-2' })
    expect(faculty(12, true)).toMatchObject({ unitAmount: 15000, quantity: 12, seats: 12, listAmount: 1800, interval: 'year' })
    expect(faculty(7.9).quantity).toBe(7)
    expect(() => faculty(4)).toThrow('starts from 5 lecturers')
    expect(() => faculty(1)).toThrow(BillingError)
    expect(() => faculty(501)).toThrow('contact Dobry')
    // A number of lecturers sent for a plan that is not priced per lecturer changes nothing.
    expect(chargeFor(DEFAULT_CATALOG, 'education', 'lecturers-1', 'myr', false, null, today, 40)).toMatchObject({ unitAmount: 1900, quantity: 1, seats: 0 })
    expect(chargeFor(DEFAULT_CATALOG, 'workplace', 'workplace-1', 'myr', false, null, today, 40)).toMatchObject({ unitAmount: 4900, quantity: 1, seats: 20 })
  })

  it('gives a trainer twelve months for the price of ten when paid by the year', () => {
    expect(charge('training', 'trainers-1', 'usd', true)).toMatchObject({ unitAmount: 9000, listAmount: 90, interval: 'year', intervalCount: 1, cycle: 'year' })
    expect(charge('training', 'trainers-1', 'myr', true).unitAmount).toBe(39000)
  })

  it('refuses a yearly price where none is offered', () => {
    expect(() => charge('workplace', 'workplace-1', 'usd', true)).toThrow(BillingError)
    expect(() => charge('workplace', 'workplace-3', 'myr', true)).toThrow(BillingError)
  })

  it('never sells another edition’s plan, the free plan, a hidden plan or an unknown one', () => {
    expect(() => charge('education', 'workplace-1', 'usd')).toThrow(BillingError)
    expect(() => charge('workplace', 'workplace-0', 'usd')).toThrow(BillingError)
    expect(() => charge('workplace', 'nope', 'usd')).toThrow(BillingError)
    const hidden = { ...DEFAULT_CATALOG, workplace: DEFAULT_CATALOG.workplace.map((p) => ({ ...p, hidden: true })) }
    expect(() => chargeFor(hidden, 'workplace', 'workplace-1', 'usd', false, null, today)).toThrow(BillingError)
  })

  it('takes a standing discount off, while it lasts', () => {
    expect(charge('workplace', 'workplace-2', 'myr', false, { kind: 'percent', value: 20 })).toMatchObject({ unitAmount: 7920, listAmount: 99 })
    expect(charge('workplace', 'workplace-2', 'myr', false, { kind: 'amount', value: 10 }).unitAmount).toBe(8900)
    expect(charge('workplace', 'workplace-2', 'myr', false, { kind: 'percent', value: 20, until: '2026-10-08' }).unitAmount).toBe(7920)
    expect(charge('workplace', 'workplace-2', 'myr', false, { kind: 'percent', value: 20, until: '2026-10-07' }).unitAmount).toBe(9900)
  })

  it('does not send a customer to pay nothing', () => {
    expect(() => charge('workplace', 'workplace-1', 'usd', false, { kind: 'percent', value: 100 })).toThrow(BillingError)
  })

  it('uses the price list from the Console when one is saved', () => {
    const saved = { ...DEFAULT_CATALOG, workplace: [{ id: 'w-new', name: 'Team', priceMyr: 59, priceUsd: 15, cycle: 'month' as const, seats: 30 }] }
    expect(chargeFor(saved, 'workplace', 'w-new', 'myr', false, null, today)).toMatchObject({ unitAmount: 5900, seats: 30, productName: 'Dobry Workplace · Team' })
  })
})

describe('what a subscription gives an organisation', () => {
  const c = charge('workplace', 'workplace-2', 'myr')
  const metadata = subscriptionMetadata('org1', 'workplace-2', c)
  const end = Date.UTC(2026, 10, 8) / 1000

  it('makes it Pro until the paid period ends, plus a few days’ grace', () => {
    expect(patchFromSubscription({ id: 'sub_1', status: 'active', periodEnd: end, currency: 'myr', metadata })).toEqual({
      plan: 'pro',
      paidUntil: end * 1000 + GRACE_DAYS * 86_400_000,
      seats: 50,
      price: { amount: 99, currency: 'MYR', cycle: 'month' },
      stripeSubscriptionId: 'sub_1',
      stripeStatus: 'active',
      planId: 'workplace-2',
    })
  })

  it('keeps Pro while Stripe is retrying a failed card', () => {
    expect(patchFromSubscription({ id: 'sub_1', status: 'past_due', periodEnd: end, currency: 'myr', metadata }).plan).toBe('pro')
  })

  it('takes Pro away when the subscription has ended', () => {
    for (const status of ['canceled', 'unpaid', 'incomplete_expired', 'incomplete']) {
      expect(patchFromSubscription({ id: 'sub_1', status, periodEnd: end, currency: 'myr', metadata })).toMatchObject({ plan: 'free', paidUntil: null, seats: null, stripeSubscriptionId: null })
    }
  })

  it('puts no number on one lecturer’s plan, and the lecturers paid for on a faculty’s', () => {
    const lecturer = subscriptionMetadata('org2', 'lecturers-1', charge('education', 'lecturers-1', 'usd'))
    expect(patchFromSubscription({ id: 'sub_2', status: 'active', periodEnd: end, currency: 'usd', metadata: lecturer })).toMatchObject({ seats: null, price: { amount: 5, currency: 'USD', cycle: 'month' } })
    const faculty = subscriptionMetadata('org3', 'lecturers-2', chargeFor(DEFAULT_CATALOG, 'education', 'lecturers-2', 'usd', false, null, today, 8))
    expect(patchFromSubscription({ id: 'sub_3', status: 'active', periodEnd: end, currency: 'usd', metadata: faculty })).toMatchObject({ seats: 8, planId: 'lecturers-2', price: { amount: 32, currency: 'USD', cycle: 'month' } })
  })
})
