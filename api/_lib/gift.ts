import { type EditionId, editionOf } from './billing.js'

/**
 * Free access codes: a code Attend's team makes and hands to a person or an organisation, which
 * gives Pro for a number of months without any payment. Plain logic, tested on its own.
 */
export interface GiftCode {
  code: string
  /** Which edition may use it, or any. */
  edition: EditionId | 'any'
  /** Months of Pro each time it is used. */
  months: number
  /** Workplace: staff covered (0 = no limit). */
  seats: number
  /** How many organisations may use it. */
  maxUses: number
  uses: number
  /** Last day it can be used (YYYY-MM-DD), or none. */
  redeemBy?: string | null
  /** Who it is for: a note for the team. */
  note: string
  disabled?: boolean
  /** Organisations that have used it. */
  redeemedBy?: string[]
}

export class GiftError extends Error {}

// No 0/O/1/I/L: codes get read aloud and typed by hand.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** A new code such as ATT-7KQ2-M9XD, from random bytes. */
export function newCode(bytes: Uint8Array): string {
  const chars = Array.from(bytes.slice(0, 8), (b) => ALPHABET[b % ALPHABET.length]).join('')
  return `ATT-${chars.slice(0, 4)}-${chars.slice(4, 8)}`
}

/** What someone typed, tidied to the stored form: capitals, no spaces. */
export const tidyCode = (typed: string) => typed.trim().toUpperCase().replace(/\s+/g, '')

/** Throws a GiftError, with a message fit to show the customer, when the code cannot be used. */
export function checkGift(gift: GiftCode | undefined, org: { purpose?: string }, orgId: string, today: string): GiftCode {
  if (!gift || gift.disabled) throw new GiftError('That code is not valid. Check it and try again.')
  if (gift.redeemBy && gift.redeemBy < today) throw new GiftError('That code has expired.')
  if ((gift.redeemedBy ?? []).includes(orgId)) throw new GiftError('Your organisation has already used this code.')
  if (gift.uses >= gift.maxUses) throw new GiftError('That code has already been used.')
  if (gift.edition !== 'any' && gift.edition !== editionOf(org.purpose)) throw new GiftError('That code is for a different edition of Attend.')
  return gift
}

/** A date `months` calendar months on. */
export function addMonths(from: number, months: number): number {
  const d = new Date(from)
  const day = d.getUTCDate()
  d.setUTCMonth(d.getUTCMonth() + months)
  // 31 January + 1 month is the end of February, not early March.
  if (d.getUTCDate() < day) d.setUTCDate(0)
  return d.getTime()
}

export interface GiftPatch {
  /** Free Pro runs to here (milliseconds). A second code adds on to the end of the first. */
  giftUntil: number
  /** Pro as a whole runs to here: the later of what is paid for and what is given. */
  paidUntil: number
  /** Null = no limit. */
  seats: number | null
}

/** What using a code gives an organisation that may already have a gift or a paid plan. */
export function giftPatch(
  org: { purpose?: string; plan?: string; paidUntil?: number | null; giftUntil?: number | null; seats?: number | null },
  gift: Pick<GiftCode, 'months' | 'seats'>,
  now: number,
): GiftPatch {
  const giftUntil = addMonths(Math.max(now, org.giftUntil ?? 0), gift.months)
  const paid = org.plan === 'pro' && org.paidUntil && org.paidUntil > now ? org.paidUntil : 0
  return { giftUntil, paidUntil: Math.max(paid, giftUntil), seats: withGift(org.purpose, paid ? (org.seats ?? null) : undefined, gift.seats) }
}

/**
 * The staff limit when a gift and (maybe) a paid plan both apply: whichever covers more.
 * `current` is undefined when nothing is being paid for; null means no limit.
 */
export function withGift(purpose: string | undefined, current: number | null | undefined, giftSeats: number): number | null {
  if (editionOf(purpose) !== 'workplace') return null
  const gift = giftSeats > 0 ? giftSeats : null
  if (current === undefined) return gift
  return current === null || gift === null ? null : Math.max(current, gift)
}
