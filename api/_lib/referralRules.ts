/**
 * Inviting friends: the rules, as plain logic with no imports, tested on their own. An account
 * earns Pro for a while when enough of the friends it invited have really started using Dobry.
 * It is meant to take some effort: Pro is worth having, and is not handed out for a signup.
 */

/** Friends who must count before Pro is earned. */
export const FRIENDS_FOR_PRO = 5
/** Months of Pro earned each time: one, so there is always a reason to keep inviting. */
export const REWARD_MONTHS = 1
/** How many times one account can earn it: a year of Pro at most. */
export const MAX_REWARDS = 12
/** A friend must make their account within this many days of opening the invite link's sign-up. */
export const CLAIM_DAYS = 2
/** Staff a workplace's earned Pro covers: the smallest paid size. */
export const REWARD_SEATS = 20

/** What it takes for a friend to count: one real session, with this many people scanning in… */
export const SCANS_NEEDED = 5
/** …from at least this many different phones, so one person cannot do it alone on one phone. */
export const PHONES_NEEDED = 3

// No 0/O/1/I/L: codes get read aloud and typed by hand.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** A new invite code such as K7QM2XDP, from random bytes. */
export const newRefCode = (bytes: Uint8Array) => Array.from(bytes.slice(0, 8), (b) => ALPHABET[b % ALPHABET.length]).join('')

/** What someone typed or followed, tidied to the stored form. Empty when it cannot be a code. */
export const tidyRefCode = (typed: unknown) => {
  const code = typeof typed === 'string' ? typed.trim().toUpperCase() : ''
  return /^[A-Z0-9]{6,12}$/.test(code) ? code : ''
}

/** Whether one session's check-ins are a real session: enough people, by QR, from enough phones. */
export function realSession(records: { method?: string; device?: string }[]): boolean {
  const scans = records.filter((r) => r.method === 'qr')
  return scans.length >= SCANS_NEEDED && new Set(scans.map((r) => r.device).filter(Boolean)).size >= PHONES_NEEDED
}

/** How many rewards an account has earned in all, for the friends that count so far. */
export const rewardsEarned = (counted: number) => Math.min(MAX_REWARDS, Math.floor(Math.max(0, counted) / FRIENDS_FOR_PRO))

/** Rewards still to give: earned, less those already given. */
export const rewardsDue = (counted: number, given: number) => Math.max(0, rewardsEarned(counted) - Math.max(0, given))

/** Friends still needed for the next reward; 0 once every reward has been earned. */
export const friendsToGo = (counted: number) => (rewardsEarned(counted) >= MAX_REWARDS ? 0 : FRIENDS_FOR_PRO - (counted % FRIENDS_FOR_PRO))

/**
 * Why an account may not be put down as invited by a code, in words for its owner; null when it may.
 * Only a brand-new account can be: nobody already using Dobry is "invited" after the fact.
 */
export function claimProblem(a: { ownCode?: string; code: string; referrerOrgId?: string; orgId: string; createdAt?: number; alreadyClaimed: boolean; sameOwner: boolean }, now: number): string | null {
  if (!a.referrerOrgId) return 'That invite link is not valid.'
  if (a.referrerOrgId === a.orgId || a.ownCode === a.code || a.sameOwner) return 'You cannot invite yourself.'
  if (a.alreadyClaimed) return 'This account was already invited by someone.'
  if (!a.createdAt || now - a.createdAt > CLAIM_DAYS * 86_400_000) return 'An invite only counts for a new account.'
  return null
}
