import { randomBytes } from 'node:crypto'
import { FieldValue, type Firestore, Timestamp } from 'firebase-admin/firestore'
import { emailOrg } from './email.js'
import { giftPatch } from './gift.js'
import { FRIENDS_FOR_PRO, MAX_REWARDS, REWARD_MONTHS, REWARD_SEATS, friendsToGo, newRefCode, realSession, rewardsDue } from './referralRules.js'

/**
 * Invites are kept where no browser can read or write: `referralCodes/{code}` (whose code it is,
 * and the rewards already given) and `referrals/{invitedOrgId}` (who invited them, and when they
 * came to count). So nobody can invent an invite, or mark their own as counted.
 */
export interface ReferralStatus {
  code: string
  /** Friends who made an account from the link. */
  joined: number
  /** Of those, the ones who have really started using Dobry. */
  counted: number
  /** Friends still needed for the next reward (0 when every reward is earned). */
  toGo: number
  rewards: number
  maxRewards: number
  friendsForPro: number
  rewardMonths: number
  /** Pro runs to here (milliseconds), when the account has it. */
  proUntil: number | null
}

/** The account's invite code, made the first time it is asked for. */
export async function codeFor(db: Firestore, orgId: string): Promise<string> {
  const mine = await db.collection('referralCodes').where('orgId', '==', orgId).limit(1).get()
  if (!mine.empty) return mine.docs[0].id
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newRefCode(randomBytes(8))
    try {
      await db.doc(`referralCodes/${code}`).create({ orgId, rewards: 0, createdAt: FieldValue.serverTimestamp() })
      return code
    } catch {
      // Taken (one chance in billions): try another.
    }
  }
  throw new Error('Could not make an invite code.')
}

/** Whether an invited account has run a real session yet. Reads as little as it can. */
async function hasStarted(db: Firestore, orgId: string): Promise<boolean> {
  const sessions = await db.collection('sessions').where('organisationId', '==', orgId).limit(60).get()
  for (const s of sessions.docs) {
    if (s.data().status === 'scheduled' || (s.data().presentCount ?? 0) < 1) continue
    const records = await db.collection('attendance').where('organisationId', '==', orgId).where('sessionId', '==', s.id).select('method', 'device').limit(40).get()
    if (realSession(records.docs.map((d) => d.data() as { method?: string; device?: string }))) return true
  }
  return false
}

/**
 * Brings an account's invites up to date: marks the friends who now count, gives any Pro that has
 * been earned (with an email and a line in the audit log), and reports where things stand. Safe
 * to run as often as wanted: a friend counts once and a reward is given once.
 */
export async function settle(db: Firestore, orgId: string): Promise<ReferralStatus> {
  const code = await codeFor(db, orgId)
  const friends = await db.collection('referrals').where('referrer', '==', orgId).get()
  for (const f of friends.docs) {
    if (f.data().countedAt) continue
    if (await hasStarted(db, f.id)) await f.ref.update({ countedAt: FieldValue.serverTimestamp() })
  }
  const counted = (await db.collection('referrals').where('referrer', '==', orgId).get()).docs.filter((d) => d.data().countedAt).length
  const codeRef = db.doc(`referralCodes/${code}`)
  const orgRef = db.doc(`organisations/${orgId}`)
  const now = Date.now()

  const given = await db.runTransaction(async (tx) => {
    const [codeSnap, orgSnap] = await Promise.all([tx.get(codeRef), tx.get(orgRef)])
    const org = orgSnap.data()
    const already: number = codeSnap.data()?.rewards ?? 0
    const due = rewardsDue(counted, already)
    // Early access already has everything: the reward waits until it would mean something.
    if (!org || due === 0 || (org.plan ?? 'early') === 'early') return 0
    const p = giftPatch(
      { purpose: org.purpose, plan: org.plan, paidUntil: org.paidUntil?.toMillis?.() ?? null, giftUntil: org.giftUntil?.toMillis?.() ?? null, seats: org.seats ?? null },
      { months: REWARD_MONTHS * due, seats: org.purpose === 'workplace' ? REWARD_SEATS : 0 },
      now,
    )
    tx.update(orgRef, {
      plan: 'pro',
      paidUntil: Timestamp.fromMillis(p.paidUntil),
      giftUntil: Timestamp.fromMillis(p.giftUntil),
      giftSeats: org.purpose === 'workplace' ? Math.max(org.giftSeats ?? 0, REWARD_SEATS) : (org.giftSeats ?? 0),
      seats: p.seats ?? FieldValue.delete(),
    })
    tx.update(codeRef, { rewards: already + due, lastRewardAt: FieldValue.serverTimestamp() })
    tx.set(db.collection('platformAudit').doc(), {
      actor: 'dobry',
      actorEmail: 'Dobry',
      action: 'invites',
      detail: `${counted} invited friends now use Dobry: Pro free for ${REWARD_MONTHS * due} months, until ${new Date(p.giftUntil).toDateString()}`,
      organisationId: orgId,
      organisationName: org.name ?? '',
      at: FieldValue.serverTimestamp(),
    })
    return due
  })

  const org = (await orgRef.get()).data() ?? {}
  const proUntil = org.plan === 'pro' && org.paidUntil?.toMillis?.() > now ? org.paidUntil.toMillis() : null
  if (given > 0) {
    await emailOrg(db, orgId, 'referralReward', { friends: String(counted), months: String(REWARD_MONTHS * given), until: proUntil ? new Date(proUntil).toISOString().slice(0, 10) : '' }, `referralReward_${now}`).catch(() => {})
  }
  const rewards: number = ((await codeRef.get()).data()?.rewards ?? 0) as number
  return { code, joined: friends.size, counted, toGo: friendsToGo(counted), rewards, maxRewards: MAX_REWARDS, friendsForPro: FRIENDS_FOR_PRO, rewardMonths: REWARD_MONTHS, proUntil }
}

/** Everyone with a friend still to count: looked at once a day, so Pro arrives without their asking. */
export async function settleAll(db: Firestore): Promise<number> {
  const waiting = await db.collection('referrals').where('countedAt', '==', null).limit(300).get()
  const referrers = [...new Set(waiting.docs.map((d) => d.data().referrer as string))]
  for (const orgId of referrers) await settle(db, orgId).catch(() => {})
  return referrers.length
}
