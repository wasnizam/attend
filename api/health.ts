import { failure, json, modeOf, stripeSettings } from './_lib/server.js'

/** Which settings are in place, without showing any of them: for checking the set-up. */
export async function GET(): Promise<Response> {
  try {
    const { secretKey, webhookSecret, source } = await stripeSettings()
    return json({
      ok: true,
      stripeKey: Boolean(secretKey),
      mode: modeOf(secretKey),
      keysFrom: source,
      webhookSecret: Boolean(webhookSecret),
      firebase: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT?.trim()),
    })
  } catch (e) {
    return failure(e)
  }
}
