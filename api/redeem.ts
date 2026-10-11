import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { GiftError, type GiftCode, checkGift, giftPatch, tidyCode } from './_lib/gift.js'
import { HttpError, caller, failure, firebase, json } from './_lib/server.js'

/**
 * Uses a free access code: the organisation gets Pro for the code's months, with no payment.
 * Checked and applied in one step on the server, so a code cannot be used more times than allowed.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const me = await caller(request)
    const body = (await request.json().catch(() => ({}))) as { code?: unknown }
    const code = tidyCode(typeof body.code === 'string' ? body.code : '')
    if (!/^[A-Z0-9-]{4,40}$/.test(code)) throw new HttpError(400, 'That code is not valid. Check it and try again.')
    const { db } = firebase()
    const codeRef = db.doc(`giftCodes/${code}`)
    const orgRef = db.doc(`organisations/${me.orgId}`)
    const now = Date.now()

    const until = await db.runTransaction(async (tx) => {
      const [giftSnap, orgSnap] = await Promise.all([tx.get(codeRef), tx.get(orgRef)])
      const org = orgSnap.data()
      if (!org) throw new HttpError(404, 'Organisation not found.')
      let gift: GiftCode
      try {
        gift = checkGift(giftSnap.data() as GiftCode | undefined, org, me.orgId, new Date(now).toISOString().slice(0, 10))
      } catch (e) {
        if (e instanceof GiftError) throw new HttpError(400, e.message)
        throw e
      }
      const p = giftPatch({ purpose: org.purpose, plan: org.plan, paidUntil: org.paidUntil?.toMillis?.() ?? null, giftUntil: org.giftUntil?.toMillis?.() ?? null, seats: org.seats ?? null }, gift, now)
      tx.update(orgRef, {
        plan: 'pro',
        paidUntil: Timestamp.fromMillis(p.paidUntil),
        giftUntil: Timestamp.fromMillis(p.giftUntil),
        giftSeats: gift.seats,
        seats: p.seats ?? FieldValue.delete(),
      })
      tx.update(codeRef, { uses: FieldValue.increment(1), redeemedBy: FieldValue.arrayUnion(me.orgId), lastUsedAt: FieldValue.serverTimestamp() })
      tx.set(db.collection('platformAudit').doc(), {
        actor: me.uid,
        actorEmail: me.email,
        action: 'free code',
        detail: `Used ${code}: Pro free for ${gift.months} month${gift.months === 1 ? '' : 's'}, until ${new Date(p.giftUntil).toDateString()}${gift.note ? ` (${gift.note})` : ''}`,
        organisationId: me.orgId,
        organisationName: org.name ?? '',
        at: FieldValue.serverTimestamp(),
      })
      return p.paidUntil
    })
    return json({ until })
  } catch (e) {
    return failure(e)
  }
}
