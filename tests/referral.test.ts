import { describe, expect, it } from 'vitest'
import { emailText } from '../api/_lib/emailText'
import { CLAIM_DAYS, FRIENDS_FOR_PRO, MAX_REWARDS, REWARD_MONTHS, claimProblem, friendsToGo, newRefCode, realSession, rewardsDue, rewardsEarned, tidyRefCode } from '../api/_lib/referralRules'

const DAY = 86_400_000
const now = Date.UTC(2026, 9, 12)

describe('invite codes', () => {
  it('are eight characters with none that are easily misread', () => {
    const code = newRefCode(new Uint8Array([0, 1, 2, 30, 31, 200, 255, 17, 99]))
    expect(code).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/)
    expect(newRefCode(new Uint8Array(8).fill(7))).toBe('HHHHHHHH')
  })

  it('are tidied from what was typed, and refused when they cannot be one', () => {
    expect(tidyRefCode('  k7qm2xdp ')).toBe('K7QM2XDP')
    expect(tidyRefCode('abc')).toBe('')
    expect(tidyRefCode('K7QM-2XDP')).toBe('')
    expect(tidyRefCode(undefined)).toBe('')
    expect(tidyRefCode({ $ne: '' })).toBe('')
  })
})

describe('when an invited friend counts', () => {
  const scan = (device: string, method = 'qr') => ({ method, device })

  it('takes a real session: five people scanning, from at least three phones', () => {
    expect(realSession([scan('a'), scan('b'), scan('c'), scan('a'), scan('b')])).toBe(true)
    expect(realSession([scan('a'), scan('b'), scan('c'), scan('d')])).toBe(false)
  })

  it('does not count one person checking five names in on their own phone, or names added by hand', () => {
    expect(realSession([scan('a'), scan('a'), scan('a'), scan('a'), scan('a'), scan('a')])).toBe(false)
    expect(realSession([scan('a'), scan('a'), scan('a'), scan('a'), scan('b')])).toBe(false)
    expect(realSession([scan('a', 'manual'), scan('b', 'manual'), scan('c', 'manual'), scan('d', 'manual'), scan('e', 'manual')])).toBe(false)
    expect(realSession([{ method: 'qr' }, { method: 'qr' }, { method: 'qr' }, { method: 'qr' }, { method: 'qr' }])).toBe(false)
  })
})

describe('earning Pro', () => {
  it('takes five friends each time, and is not given for fewer', () => {
    expect(FRIENDS_FOR_PRO).toBe(5)
    expect([0, 1, 4, 5, 9, 10, 14, 15].map(rewardsEarned)).toEqual([0, 0, 0, 1, 1, 2, 2, 3])
    expect([0, 3, 5, 7, 9].map(friendsToGo)).toEqual([5, 2, 5, 3, 1])
  })

  it('gives one month each time, and stops at a year of Pro, however many friends', () => {
    expect(REWARD_MONTHS).toBe(1)
    expect(REWARD_MONTHS * MAX_REWARDS).toBe(12)
    expect(rewardsEarned(FRIENDS_FOR_PRO * MAX_REWARDS)).toBe(MAX_REWARDS)
    expect(rewardsEarned(500)).toBe(MAX_REWARDS)
    expect(friendsToGo(500)).toBe(0)
  })

  it('gives each reward once', () => {
    expect(rewardsDue(5, 0)).toBe(1)
    expect(rewardsDue(5, 1)).toBe(0)
    expect(rewardsDue(12, 1)).toBe(1)
    expect(rewardsDue(4, 0)).toBe(0)
    expect(rewardsDue(5, 3)).toBe(0)
    expect(rewardsDue(-2, 0)).toBe(0)
  })
})

describe('who can be put down as invited', () => {
  const ok = { code: 'K7QM2XDP', referrerOrgId: 'friend', orgId: 'me', createdAt: now - 3600_000, alreadyClaimed: false, sameOwner: false }

  it('a brand-new account, from someone else’s link', () => {
    expect(claimProblem(ok, now)).toBeNull()
  })

  it('never yourself, by your own code, your own account or a second account of yours', () => {
    expect(claimProblem({ ...ok, referrerOrgId: 'me' }, now)).toMatch(/invite yourself/)
    expect(claimProblem({ ...ok, ownCode: 'K7QM2XDP' }, now)).toMatch(/invite yourself/)
    expect(claimProblem({ ...ok, sameOwner: true }, now)).toMatch(/invite yourself/)
  })

  it('not an account that has been around a while, one already invited, or a code that does not exist', () => {
    expect(claimProblem({ ...ok, createdAt: now - (CLAIM_DAYS + 1) * DAY }, now)).toMatch(/new account/)
    expect(claimProblem({ ...ok, createdAt: undefined }, now)).toMatch(/new account/)
    expect(claimProblem({ ...ok, alreadyClaimed: true }, now)).toMatch(/already invited/)
    expect(claimProblem({ ...ok, referrerOrgId: undefined }, now)).toMatch(/not valid/)
  })
})

describe('the email for earning Pro', () => {
  it('says how many friends, how long, and that nothing needs paying or cancelling', () => {
    const e = emailText('referralReward', { name: 'Ali', organisation: 'MAXU' }, { friends: '5', months: '1', until: '2026-11-12' })
    expect(e.subject).toBe('You have earned Dobry Pro')
    expect(e.lines.join(' ')).toMatch(/5 of the friends you invited now use Dobry, so MAXU has Pro free for 1 month\./)
    expect(e.lines.join(' ')).toMatch(/until 12 November 2026/)
    expect(e.lines.join(' ')).toMatch(/nothing to pay and nothing to cancel/)
  })
})
