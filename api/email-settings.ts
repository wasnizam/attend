import { FieldValue } from 'firebase-admin/firestore'
import { EMAIL_SECRETS, emailSettings, forgetEmailSettings, send } from './_lib/email.js'
import { emailText, render } from './_lib/emailText.js'
import { HttpError, failure, firebase, json, origin } from './_lib/server.js'

const KEY = /^re_[A-Za-z0-9_]{16,}$/
const FROM = /^[^<>@]{0,60}<?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?$/

/**
 * The email set-up, managed from the Console by an owner of Dobry: the email service's key, and
 * the address customers see emails come from. The key can be saved, replaced, removed and tried
 * out, but never read back: only its last four characters are ever sent to a browser.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const token = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1]
    if (!token) throw new HttpError(401, 'Please log in again.')
    const { db, auth } = firebase()
    const decoded = await auth.verifyIdToken(token).catch(() => null)
    if (!decoded) throw new HttpError(401, 'Please log in again.')
    const staff = await db.doc(`platformOwners/${decoded.uid}`).get()
    if (!staff.exists || (staff.data()?.role ?? 'owner') !== 'owner') throw new HttpError(403, 'Only an owner of Dobry can manage the email set-up.')

    const body = (await request.json().catch(() => ({}))) as { action?: string; apiKey?: unknown; from?: unknown; replyTo?: unknown }
    const ref = db.doc(EMAIL_SECRETS)
    const audit = (detail: string) => db.collection('platformAudit').add({ actor: decoded.uid, actorEmail: decoded.email ?? '', action: 'email set-up', detail, at: FieldValue.serverTimestamp() })
    let tested: { ok: boolean; error?: string; to?: string } | undefined

    if (body.action === 'save') {
      const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
      const from = typeof body.from === 'string' ? body.from.trim() : ''
      const replyTo = typeof body.replyTo === 'string' ? body.replyTo.trim() : ''
      if (!apiKey && !from && !replyTo) throw new HttpError(400, 'Enter something to save.')
      if (apiKey && !KEY.test(apiKey)) throw new HttpError(400, 'That is not a Resend API key. It starts with re_.')
      if (from && !FROM.test(from)) throw new HttpError(400, 'Write the sender as a name and an address, like: Dobry <hello@dobry.app>')
      if (replyTo && !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(replyTo)) throw new HttpError(400, 'The reply address does not look right.')
      await ref.set({ ...(apiKey ? { apiKey, keyEnd: apiKey.slice(-4) } : {}), ...(from ? { from } : {}), ...(typeof body.replyTo === 'string' ? { replyTo } : {}), updatedAt: FieldValue.serverTimestamp(), updatedBy: decoded.email ?? decoded.uid }, { merge: true })
      forgetEmailSettings()
      await audit(`Saved ${[apiKey && `key ending ${apiKey.slice(-4)}`, from && `sender ${from}`, replyTo && `replies to ${replyTo}`].filter(Boolean).join(', ')}`)
    } else if (body.action === 'clear') {
      await ref.delete()
      forgetEmailSettings()
      await audit('Removed the email set-up')
    } else if (body.action === 'test') {
      if (!decoded.email) throw new HttpError(400, 'Your own account has no email address to send the test to.')
      const settings = await emailSettings(true)
      const words = emailText('test', { name: decoded.name })
      const { html, text } = render(words, origin(request), settings.from.replace(/<.*$/, '').trim() || 'Dobry')
      tested = { ...(await send(settings, decoded.email, words.subject, html, text)), to: decoded.email }
      await audit(tested.ok ? `Test email sent to ${decoded.email}` : `Test email failed: ${tested.error}`)
    } else if (body.action !== 'status') {
      throw new HttpError(400, 'Unknown request.')
    }

    const saved = (await ref.get()).data() ?? {}
    const live = await emailSettings(true)
    return json({
      ready: Boolean(live.apiKey && live.from),
      keyEnd: saved.keyEnd ?? null,
      keyFromVercel: !saved.apiKey && Boolean(live.apiKey),
      from: live.from,
      replyTo: live.replyTo,
      updatedBy: saved.updatedBy ?? null,
      updatedAt: saved.updatedAt?.toMillis?.() ?? null,
      tested,
    })
  } catch (e) {
    return failure(e)
  }
}
