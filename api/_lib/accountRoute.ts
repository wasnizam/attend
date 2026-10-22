import { FieldValue } from 'firebase-admin/firestore'
import { HttpError, failure, firebase, json, member } from './server.js'

const DAY = 86_400_000

/**
 * "Delete my account", from the Account page (and required in the App Store app). The person is
 * signed out and cannot sign in again at once; their account, and for an owner the whole
 * organisation and its records, is then deleted by Dobry's team within 30 days, as the privacy
 * page promises. A task for that lands in the Console.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const me = await member(request)
    const body = (await request.json().catch(() => ({}))) as { action?: string; confirm?: unknown }
    if (body.action !== 'delete') throw new HttpError(400, 'Unknown request.')
    if (body.confirm !== 'DELETE') throw new HttpError(400, 'Type DELETE to confirm.')
    const { db, auth } = firebase()
    const owner = me.org.ownerId === me.uid
    const now = Date.now()
    const due = new Date(now + 30 * DAY).toISOString().slice(0, 10)
    const users = owner ? (await db.collection('users').where('organisationId', '==', me.orgId).get()).docs.map((d) => d.id) : [me.uid]
    const batch = db.batch()
    for (const uid of users) batch.update(db.doc(`users/${uid}`), { status: 'disabled', deletionRequested: now })
    if (owner) batch.update(db.doc(`organisations/${me.orgId}`), { deletionRequested: now, marketingOff: true })
    batch.set(db.collection('platformTasks').doc(), {
      title: owner
        ? `Delete account and all data of ${me.org.name ?? me.orgId} (${users.length} ${users.length === 1 ? 'login' : 'logins'}), as asked by the owner ${me.email}. Cancel any subscription first.`
        : `Delete the login of ${me.email} from ${me.org.name ?? me.orgId}, as they asked. Their organisation's records stay with the organisation.`,
      due,
      organisationId: me.orgId,
      organisationName: String(me.org.name ?? ''),
      done: false,
      by: 'dobry',
      at: FieldValue.serverTimestamp(),
    })
    batch.set(db.collection('platformAudit').doc(), { actor: me.uid, actorEmail: me.email, action: 'deletion requested', detail: owner ? `Owner asked to delete ${me.org.name ?? ''} and all its data` : `Asked to delete their login`, organisationId: me.orgId, organisationName: String(me.org.name ?? ''), at: FieldValue.serverTimestamp() })
    await batch.commit()
    // Nobody signs in to an account that is being deleted.
    await Promise.all(users.map((uid) => auth.updateUser(uid, { disabled: true }).catch(() => {})))
    return json({ requested: true, owner, by: due })
  } catch (e) {
    return failure(e)
  }
}
