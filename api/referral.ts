import { FieldValue } from 'firebase-admin/firestore'
import { codeFor, settle } from './_lib/referral.js'
import { claimProblem, tidyRefCode } from './_lib/referralRules.js'
import { HttpError, caller, failure, firebase, json, origin } from './_lib/server.js'

/**
 * Inviting friends. `mine`: this account's invite link and how far it has got (friends who now
 * count are found, and Pro is given, as part of asking). `claim`: a new account says whose link
 * it came from; checked here, so nobody can claim an invite they are not due.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const me = await caller(request)
    const { db } = firebase()
    const body = (await request.json().catch(() => ({}))) as { action?: string; code?: unknown }

    if (body.action === 'claim') {
      const code = tidyRefCode(body.code)
      if (!code) throw new HttpError(400, 'That invite link is not valid.')
      const [codeSnap, mineSnap, ownCodes] = await Promise.all([
        db.doc(`referralCodes/${code}`).get(),
        db.doc(`referrals/${me.orgId}`).get(),
        db.collection('referralCodes').where('orgId', '==', me.orgId).limit(1).get(),
      ])
      const referrerOrgId: string | undefined = codeSnap.data()?.orgId
      const referrer = referrerOrgId ? (await db.doc(`organisations/${referrerOrgId}`).get()).data() : undefined
      const problem = claimProblem(
        {
          code,
          ownCode: ownCodes.docs[0]?.id,
          referrerOrgId,
          orgId: me.orgId,
          createdAt: me.org.createdAt?.toMillis?.(),
          alreadyClaimed: mineSnap.exists,
          sameOwner: Boolean(referrer && referrer.ownerId === me.uid),
        },
        Date.now(),
      )
      if (problem) throw new HttpError(400, problem)
      // `create` fails if another request got there first: an account is invited once.
      await db.doc(`referrals/${me.orgId}`).create({ referrer: referrerOrgId, code, claimedAt: FieldValue.serverTimestamp(), countedAt: null })
      return json({ claimed: true })
    }

    if (body.action === 'mine' || !body.action) {
      // Their own friends may have started since last time; and they may now count for whoever invited them.
      const status = await settle(db, me.orgId)
      const invitedBy = (await db.doc(`referrals/${me.orgId}`).get()).data()
      if (invitedBy?.referrer && !invitedBy.countedAt) await settle(db, invitedBy.referrer).catch(() => {})
      return json({ ...status, link: `${origin(request)}/?ref=${status.code}` })
    }
    // A code alone, for the sign-up page to say whose invite it is. Nothing private.
    if (body.action === 'code') return json({ code: await codeFor(db, me.orgId) })
    throw new HttpError(400, 'Unknown request.')
  } catch (e) {
    return failure(e)
  }
}
