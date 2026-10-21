import { FieldValue } from 'firebase-admin/firestore'
import { HttpError, failure, firebase, json, member } from './server.js'

/**
 * The one-question survey in the app: how likely someone is to recommend Dobry (0–10), why, and
 * whether Dobry may quote them. One answer per person (a new answer replaces the old one).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const me = await member(request)
    const { db } = firebase()
    const body = (await request.json().catch(() => ({}))) as { action?: string; score?: unknown; comment?: unknown; quoteOk?: unknown }
    const ref = db.doc(`feedback/${me.uid}`)
    if (body.action === 'status') return json({ answered: (await ref.get()).exists })
    if (body.action !== 'submit') throw new HttpError(400, 'Unknown request.')
    const score = Math.round(Number(body.score))
    if (!Number.isFinite(score) || score < 0 || score > 10) throw new HttpError(400, 'Choose a number from 0 to 10.')
    const user = (await db.doc(`users/${me.uid}`).get()).data()
    await ref.set({
      orgId: me.orgId,
      organisation: String(me.org.name ?? ''),
      purpose: String(me.org.purpose ?? 'education'),
      name: String(user?.name ?? ''),
      email: me.email,
      score,
      comment: String(body.comment ?? '').replace(/\s+$/g, '').slice(0, 1000),
      quoteOk: Boolean(body.quoteOk),
      at: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
    })
    return json({ saved: true })
  } catch (e) {
    return failure(e)
  }
}
