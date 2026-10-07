import { HttpError, caller, failure, json, origin, stripe } from './_lib/server.js'

/** Opens Stripe's own page where a customer changes their card, sees invoices, or cancels. */
export async function POST(request: Request): Promise<Response> {
  try {
    const me = await caller(request)
    if (!me.org.stripeCustomerId) throw new HttpError(400, 'There is no paid plan to manage yet.')
    const session = await stripe().billingPortal.sessions.create({ customer: me.org.stripeCustomerId, return_url: `${origin(request)}/app/account` })
    return json({ url: session.url })
  } catch (e) {
    return failure(e)
  }
}
