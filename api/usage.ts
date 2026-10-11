import { FieldValue } from 'firebase-admin/firestore'
import { HttpError, failure, firebase, json } from './_lib/server.js'

/**
 * Counts what an organisation is using of its plan (lecturers who can sign in, and for a
 * workplace the staff on all its lists, each person once) and records it on the organisation,
 * where no browser can write. The app and the security rules read it to hold a plan to its size.
 * Any member may ask; a manager adding staff sends the IDs first to learn what the total would be.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const token = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1]
    if (!token) throw new HttpError(401, 'Please log in again.')
    const { db, auth } = firebase()
    const decoded = await auth.verifyIdToken(token).catch(() => null)
    if (!decoded) throw new HttpError(401, 'Please log in again.')
    const user = (await db.doc(`users/${decoded.uid}`).get()).data()
    if (!user?.organisationId || user.status !== 'active') throw new HttpError(403, 'Your account cannot do this.')
    const orgId: string = user.organisationId
    const ref = db.doc(`organisations/${orgId}`)
    const org = (await ref.get()).data()
    if (!org) throw new HttpError(404, 'Organisation not found.')

    const body = (await request.json().catch(() => ({}))) as { adding?: unknown }
    const adding = Array.isArray(body.adding) ? body.adding.filter((k): k is string => typeof k === 'string' && /^[A-Z0-9._-]{1,40}$/.test(k)).slice(0, 5000) : []

    const members = await db.collection('users').where('organisationId', '==', orgId).where('status', '==', 'active').select().get()
    const lecturers = members.size

    let staff = 0
    let staffWith = 0
    if (org.purpose === 'workplace') {
      const lists = await db.collection('classes').where('organisationId', '==', orgId).select().get()
      const people = new Set<string>()
      await Promise.all(lists.docs.map(async (c) => (await db.collection(`rosters/${c.id}/students`).select().get()).forEach((s) => people.add(s.id))))
      staff = people.size
      for (const key of adding) people.add(key)
      staffWith = people.size
    }

    if (org.usage?.lecturers !== lecturers || (org.usage?.staff ?? 0) !== staff) {
      await ref.update({ usage: { lecturers, staff, at: FieldValue.serverTimestamp() } })
    }
    return json({ lecturers, staff, staffWith })
  } catch (e) {
    return failure(e)
  }
}
