import type Stripe from 'stripe'
import { BillingError, chargeFor, subscriptionMetadata } from './_lib/billing.js'
import { HttpError, caller, catalog, failure, firebase, json, origin, stripe } from './_lib/server.js'

const missing = (e: unknown) => (e as { code?: string })?.code === 'resource_missing'

/**
 * Starts a payment for a plan. The browser only says which plan; the price comes from the price
 * list on the server. Replies with Stripe's payment page to send the customer to, or, when they
 * already pay, changes their plan in place.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const me = await caller(request)
    const body = (await request.json().catch(() => ({}))) as { planId?: unknown; currency?: unknown; yearly?: unknown }
    const currency = body.currency === 'myr' ? 'myr' : 'usd'
    const { db } = firebase()
    let charge
    try {
      charge = chargeFor(await catalog(db), me.org.purpose, String(body.planId ?? ''), currency, body.yearly === true, me.org.discount, new Date().toISOString().slice(0, 10))
    } catch (e) {
      if (e instanceof BillingError) throw new HttpError(400, e.message)
      throw e
    }
    const s = await stripe()

    // One Stripe product per plan, made the first time someone buys it.
    await s.products.retrieve(charge.productId).catch((e) => {
      if (!missing(e)) throw e
      return s.products.create({ id: charge.productId, name: charge.productName })
    })

    // One Stripe customer per organisation. (An ID saved while testing does not exist in live mode.)
    let customer: string | undefined = me.org.stripeCustomerId
    if (customer) {
      const found = await s.customers.retrieve(customer).catch((e) => {
        if (!missing(e)) throw e
        return null
      })
      if (!found || (found as Stripe.DeletedCustomer).deleted) customer = undefined
    }
    if (!customer) {
      customer = (await s.customers.create({ email: me.email || undefined, name: me.org.name, metadata: { orgId: me.orgId } })).id
      await db.doc(`organisations/${me.orgId}`).update({ stripeCustomerId: customer })
    }

    const price_data = {
      currency,
      product: charge.productId,
      unit_amount: charge.unitAmount,
      recurring: { interval: charge.interval, interval_count: charge.intervalCount },
    }
    const metadata = subscriptionMetadata(me.orgId, String(body.planId), charge)

    // Already paying: move to the other plan now, and Stripe works out the difference.
    if (me.org.stripeSubscriptionId) {
      const sub = await s.subscriptions.retrieve(me.org.stripeSubscriptionId).catch((e) => {
        if (!missing(e)) throw e
        return null
      })
      if (sub && ['active', 'trialing', 'past_due'].includes(sub.status)) {
        if (sub.currency !== currency) throw new HttpError(400, 'Your plan is paid in another currency. Choose the same currency, or contact Attend to change it.')
        await s.subscriptions.update(sub.id, { items: [{ id: sub.items.data[0].id, price_data }], metadata, proration_behavior: 'create_prorations', cancel_at_period_end: false })
        return json({ changed: true })
      }
    }

    const back = origin(request)
    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      customer,
      client_reference_id: me.orgId,
      line_items: [{ price_data, quantity: 1 }],
      subscription_data: { metadata },
      metadata,
      allow_promotion_codes: true,
      success_url: `${back}/app/account?paid=1`,
      cancel_url: `${back}/app/account`,
    })
    return json({ url: session.url })
  } catch (e) {
    return failure(e)
  }
}
