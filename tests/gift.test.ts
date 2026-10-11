import { describe, expect, it } from 'vitest'
import { GiftError, type GiftCode, addMonths, checkGift, giftPatch, newCode, tidyCode, withGift } from '../api/_lib/gift'

const today = '2026-10-11'
const now = Date.UTC(2026, 9, 11)
const DAY = 86_400_000
const gift = (extra: Partial<GiftCode> = {}): GiftCode => ({ code: 'ATT-AAAA-BBBB', edition: 'any', months: 3, seats: 0, maxUses: 1, uses: 0, note: '', redeemedBy: [], ...extra })

describe('free access codes', () => {
  it('are made in a form that is easy to read aloud and type', () => {
    const code = newCode(Uint8Array.from([0, 1, 2, 3, 250, 251, 252, 253]))
    expect(code).toMatch(/^ATT-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
    expect(tidyCode('  att-7kq2 -m9xd ')).toBe('ATT-7KQ2-M9XD')
  })

  it('can be used by the right organisation, once', () => {
    expect(checkGift(gift(), { purpose: 'workplace' }, 'org1', today).months).toBe(3)
    expect(() => checkGift(undefined, {}, 'org1', today)).toThrow(GiftError)
    expect(() => checkGift(gift({ disabled: true }), {}, 'org1', today)).toThrow('not valid')
    expect(() => checkGift(gift({ uses: 1 }), {}, 'org1', today)).toThrow('already been used')
    expect(() => checkGift(gift({ maxUses: 5, uses: 1, redeemedBy: ['org1'] }), {}, 'org1', today)).toThrow('already used this code')
    expect(checkGift(gift({ maxUses: 5, uses: 1, redeemedBy: ['org1'] }), {}, 'org2', today).code).toBe('ATT-AAAA-BBBB')
  })

  it('stop working after their last day', () => {
    expect(checkGift(gift({ redeemBy: '2026-10-11' }), {}, 'org1', today).months).toBe(3)
    expect(() => checkGift(gift({ redeemBy: '2026-10-10' }), {}, 'org1', today)).toThrow('expired')
  })

  it('made for one edition do not work for another', () => {
    expect(() => checkGift(gift({ edition: 'workplace' }), { purpose: 'education' }, 'org1', today)).toThrow('different edition')
    expect(checkGift(gift({ edition: 'lecturers' }), { purpose: 'education' }, 'org1', today).months).toBe(3)
    expect(checkGift(gift({ edition: 'trainers' }), { purpose: 'training' }, 'org1', today).months).toBe(3)
  })
})

describe('what a code gives', () => {
  it('adds calendar months, and never runs past the end of a short month', () => {
    expect(new Date(addMonths(Date.UTC(2026, 9, 11), 3)).toISOString().slice(0, 10)).toBe('2027-01-11')
    expect(new Date(addMonths(Date.UTC(2027, 0, 31), 1)).toISOString().slice(0, 10)).toBe('2027-02-28')
    expect(new Date(addMonths(Date.UTC(2026, 9, 11), 12)).toISOString().slice(0, 10)).toBe('2027-10-11')
  })

  it('gives a free organisation Pro for the months, with the code’s staff limit', () => {
    const p = giftPatch({ purpose: 'workplace', plan: 'free' }, { months: 3, seats: 20 }, now)
    expect(new Date(p.giftUntil).toISOString().slice(0, 10)).toBe('2027-01-11')
    expect(p.paidUntil).toBe(p.giftUntil)
    expect(p.seats).toBe(20)
  })

  it('puts no staff limit on lecturers and trainers, or on a workplace code without one', () => {
    expect(giftPatch({ purpose: 'education' }, { months: 1, seats: 50 }, now).seats).toBeNull()
    expect(giftPatch({ purpose: 'workplace' }, { months: 1, seats: 0 }, now).seats).toBeNull()
  })

  it('adds a second code on to the end of the first', () => {
    const first = giftPatch({ purpose: 'education' }, { months: 3, seats: 0 }, now)
    const second = giftPatch({ purpose: 'education', plan: 'pro', paidUntil: first.paidUntil, giftUntil: first.giftUntil }, { months: 3, seats: 0 }, now + 5 * DAY)
    expect(new Date(second.giftUntil).toISOString().slice(0, 10)).toBe('2027-04-11')
  })

  it('never shortens what a paying customer already has, or shrinks their staff limit', () => {
    const paidUntil = now + 300 * DAY
    const p = giftPatch({ purpose: 'workplace', plan: 'pro', paidUntil, seats: 50 }, { months: 1, seats: 20 }, now)
    expect(p.paidUntil).toBe(paidUntil)
    expect(p.seats).toBe(50)
    expect(giftPatch({ purpose: 'workplace', plan: 'pro', paidUntil, seats: 20 }, { months: 1, seats: 0 }, now).seats).toBeNull()
  })

  it('ignores a paid plan that has already run out', () => {
    const p = giftPatch({ purpose: 'workplace', plan: 'pro', paidUntil: now - DAY, seats: 100 }, { months: 1, seats: 20 }, now)
    expect(p.seats).toBe(20)
    expect(p.paidUntil).toBe(p.giftUntil)
  })

  it('keeps the larger staff limit when a gift and a subscription both apply', () => {
    expect(withGift('workplace', 20, 50)).toBe(50)
    expect(withGift('workplace', 100, 50)).toBe(100)
    expect(withGift('workplace', undefined, 50)).toBe(50)
    expect(withGift('workplace', null, 50)).toBeNull()
    expect(withGift('education', 20, 50)).toBeNull()
  })
})
