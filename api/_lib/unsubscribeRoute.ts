import { timingSafeEqual } from 'node:crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { unsubscribeSecret } from './followUps.js'
import { unsubscribeToken } from './growth.js'
import { failure, firebase } from './server.js'

const page = (title: string, text: string, link?: { href: string; label: string }) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} · Dobry</title></head>
<body style="margin:0;background:#16123f;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;min-height:100vh;display:grid;place-items:center;padding:24px">
<div style="max-width:420px;background:#fff;border-radius:18px;padding:32px 28px;text-align:center">
<p style="margin:0 0 18px;color:#16123f;font-weight:800;font-size:22px">Dobry</p>
<h1 style="margin:0 0 10px;font-size:22px">${title}</h1><p style="margin:0;color:#475569;line-height:1.55">${text}</p>
${link ? `<p style="margin:22px 0 0"><a href="${link.href}" style="color:#4f46e5;font-weight:600">${link.label}</a></p>` : ''}
</div></body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  )

/**
 * The link at the foot of every follow-up email. Opening it stops the tips for that account; the
 * link proves which account it is, so nobody can stop someone else's emails by guessing. Emails
 * about the account and payments are not affected. Mail apps' one-click unsubscribe sends a POST.
 */
async function handle(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url)
    const orgId = url.searchParams.get('o') ?? ''
    const token = url.searchParams.get('t') ?? ''
    const { db } = firebase()
    const expected = orgId && !orgId.includes('/') ? unsubscribeToken(await unsubscribeSecret(db), orgId) : ''
    const ok = expected && token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected))
    if (!ok) return page('This link does not work', 'It may have been copied only in part. Open it again from the email, or reply to the email and we will stop them for you.')
    if (orgId === '_test') return page('This was a test', 'This link came from a test email, so nothing was changed.')
    const ref = db.doc(`organisations/${orgId}`)
    if (!(await ref.get()).exists) return page('Done', 'There is nothing more to send to this account.')
    const undo = url.searchParams.get('undo') === '1'
    await ref.update({ marketingOff: !undo, marketingOffAt: undo ? null : FieldValue.serverTimestamp() })
    const again = new URL(url)
    again.searchParams.set('undo', undo ? '0' : '1')
    return undo
      ? page('Tips are back on', 'You will get the occasional tip about using Dobry again.')
      : page('You will not get these tips again', 'Emails about your account and payments still arrive, because they are about your account.', { href: again.pathname + again.search, label: 'Changed your mind? Turn tips back on' })
  } catch (e) {
    return failure(e)
  }
}

export const GET = handle
export const POST = handle
