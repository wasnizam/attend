import { emailOrg } from './_lib/email.js'
import { caller, failure, firebase, json } from './_lib/server.js'

/** Sends the welcome email to someone who has just made an account. Once only, however often it is asked. */
export async function POST(request: Request): Promise<Response> {
  try {
    const me = await caller(request)
    return json({ sent: await emailOrg(firebase().db, me.orgId, 'welcome') })
  } catch (e) {
    return failure(e)
  }
}
