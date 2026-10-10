import { FieldValue } from 'firebase-admin/firestore'
import { HttpError, STRIPE_SECRETS, failure, firebase, forgetStripeSettings, json, modeOf, origin, stripeFor, stripeSettings } from './_lib/server.js'

const KEY = /^(sk|rk)_(test|live)_[A-Za-z0-9]{16,}$/
const SIGNING = /^whsec_[A-Za-z0-9]{16,}$/

/** The events the webhook must be given in Stripe, shown in the Console to copy from. */
const EVENTS = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed']

/**
 * The Stripe keys, managed from the Console by an owner of Attend. Keys can be saved, replaced or
 * removed, and checked, but never read back: only their last four characters, the account they
 * belong to, and whether they are test or live keys are ever sent to a browser.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const token = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1]
    if (!token) throw new HttpError(401, 'Please log in again.')
    const { db, auth } = firebase()
    const decoded = await auth.verifyIdToken(token).catch(() => null)
    if (!decoded) throw new HttpError(401, 'Please log in again.')
    // Only an owner: whoever holds these keys decides where the money goes.
    const staff = await db.doc(`platformOwners/${decoded.uid}`).get()
    if (!staff.exists || (staff.data()?.role ?? 'owner') !== 'owner') throw new HttpError(403, 'Only an owner of Attend can manage the payment keys.')

    const body = (await request.json().catch(() => ({}))) as { action?: string; secretKey?: unknown; webhookSecret?: unknown }
    const ref = db.doc(STRIPE_SECRETS)
    const audit = (detail: string) => db.collection('platformAudit').add({ actor: decoded.uid, actorEmail: decoded.email ?? '', action: 'payment keys', detail, at: FieldValue.serverTimestamp() })

    if (body.action === 'save') {
      const secretKey = typeof body.secretKey === 'string' ? body.secretKey.trim() : ''
      const webhookSecret = typeof body.webhookSecret === 'string' ? body.webhookSecret.trim() : ''
      if (!secretKey && !webhookSecret) throw new HttpError(400, 'Enter a key to save.')
      if (secretKey && !KEY.test(secretKey)) throw new HttpError(400, 'That is not a Stripe secret key. It starts with sk_test_ or sk_live_.')
      if (webhookSecret && !SIGNING.test(webhookSecret)) throw new HttpError(400, 'That is not a webhook signing secret. It starts with whsec_.')
      const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp(), updatedBy: decoded.email ?? decoded.uid }
      const changed: string[] = []
      if (secretKey) {
        // Ask Stripe whose key this is, so a mistyped or revoked key is never saved.
        const account = await stripeFor(secretKey).accounts.retrieveCurrent().catch(() => null)
        if (!account) throw new HttpError(400, 'Stripe did not accept that secret key. Copy it again from Stripe and try once more.')
        const name = account.settings?.dashboard?.display_name || account.business_profile?.name || account.email || account.id
        Object.assign(patch, { secretKey, keyEnd: secretKey.slice(-4), mode: modeOf(secretKey), accountId: account.id, accountName: name })
        changed.push(`secret key (${modeOf(secretKey)}, ending ${secretKey.slice(-4)}, account ${name})`)
      }
      if (webhookSecret) {
        Object.assign(patch, { webhookSecret, webhookEnd: webhookSecret.slice(-4) })
        changed.push(`webhook secret (ending ${webhookSecret.slice(-4)})`)
      }
      await ref.set(patch, { merge: true })
      forgetStripeSettings()
      await audit(`Saved ${changed.join(' and ')}`)
    } else if (body.action === 'clear') {
      await ref.delete()
      forgetStripeSettings()
      await audit('Removed the payment keys saved in the Console')
    } else if (body.action !== 'status') {
      throw new HttpError(400, 'Unknown request.')
    }

    const saved = (await ref.get()).data() ?? {}
    const live = await stripeSettings(true)
    return json({
      keysFrom: live.source,
      mode: modeOf(live.secretKey),
      secretKeySet: Boolean(live.secretKey),
      webhookSecretSet: Boolean(live.webhookSecret),
      // What is saved in the Console, described without the secrets themselves.
      saved: saved.secretKey || saved.webhookSecret
        ? {
            keyEnd: saved.keyEnd ?? null,
            webhookEnd: saved.webhookEnd ?? null,
            mode: saved.mode ?? null,
            accountId: saved.accountId ?? null,
            accountName: saved.accountName ?? null,
            updatedBy: saved.updatedBy ?? null,
            updatedAt: saved.updatedAt?.toMillis?.() ?? null,
          }
        : null,
      webhookUrl: `${origin(request)}/api/stripe-webhook`,
      events: EVENTS,
    })
  } catch (e) {
    return failure(e)
  }
}
