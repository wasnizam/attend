import { emailOrg } from './_lib/email.js'
import { tidySource } from './_lib/growth.js'
import { caller, failure, firebase, json } from './_lib/server.js'

/**
 * Sends the welcome email to someone who has just made an account, once only, however often it is
 * asked. Also keeps where they came from (a campaign link, an invite, a certificate page), for
 * the Console's sign-up sources: recorded once, and only on an account made in the last two days.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const me = await caller(request)
    const { db } = firebase()
    const body = (await request.json().catch(() => ({}))) as { source?: unknown }
    const source = tidySource(body.source)
    const created = me.org.createdAt?.toMillis?.() ?? 0
    if (source && !me.org.source && Date.now() - created < 2 * 86_400_000) await db.doc(`organisations/${me.orgId}`).update({ source }).catch(() => {})
    return json({ sent: await emailOrg(db, me.orgId, 'welcome') })
  } catch (e) {
    return failure(e)
  }
}
