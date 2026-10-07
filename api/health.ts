import { json } from './_lib/server.js'

/** Which settings are in place, without showing any of them: for checking the set-up. */
export function GET(): Response {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? ''
  return json({
    ok: true,
    stripeKey: Boolean(key),
    mode: key.startsWith('sk_live') || key.startsWith('rk_live') ? 'live' : key ? 'test' : null,
    webhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),
    firebase: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT?.trim()),
  })
}
