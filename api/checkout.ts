import type Stripe from 'stripe'
import { BillingError, STATEMENT_NAME, chargeFor, subscriptionMetadata } from './_lib/billing.js'
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
    const body = (await request.json().catch(() => ({}))) as { planId?: unknown; currency?: unknown; yearly?: unknown; quantity?: unknown }
    const currency = body.currency === 'myr' ? 'myr' : 'usd'
    // Ringgit prices are for Malaysia. Vercel tells us the country the request came from; someone
    // already paying in ringgit keeps it wherever they are.
    const country = request.headers.get('x-vercel-ip-country')
    if (currency === 'myr' && country && country !== 'MY' && me.org.price?.currency !== 'MYR') {
      throw new HttpError(400, 'Ringgit prices are for customers in Malaysia. Please choose US dollars.')
    }
    const { db } = firebase()
    let charge
    try {
      charge = chargeFor(await catalog(db), me.org.purpose, String(body.planId ?? ''), currency, body.yearly === true, me.org.discount, new Date().toISOString().slice(0, 10), Number(body.quantity) || 1)
    } catch (e) {
      if (e instanceof BillingError) throw new HttpError(400, e.message)
      throw e
    }
    // Lecturers: a plan must cover everyone who can sign in, so a faculty cannot pay for 5 and keep 30.
    if (me.org.purpose === undefined || me.org.purpose === 'education') {
      const active = (await db.collection('users').where('organisationId', '==', me.orgId).where('status', '==', 'active').select().get()).size
      const covers = Math.max(1, charge.seats)
      if (active > covers) {
        throw new HttpError(
          400,
          covers === 1
            ? `This plan is for one lecturer, and ${active} can sign in to your account. Choose the Faculty plan, or switch the others off first.`
            : `${active} lecturers can sign in to your account. Choose at least ${active}, or switch some off first.`,
        )
      }
    }
    const s = await stripe()

    // One Stripe product per plan, made the first time someone buys it. It carries its own name
    // for bank statements, so the Stripe account's own (which may serve other businesses) is left alone.
    const product = await s.products.retrieve(charge.productId).catch((e) => {
      if (!missing(e)) throw e
      return s.products.create({ id: charge.productId, name: charge.productName, statement_descriptor: STATEMENT_NAME })
    })
    if (product.name !== charge.productName || product.statement_descriptor !== STATEMENT_NAME) {
      await s.products.update(charge.productId, { name: charge.productName, statement_descriptor: STATEMENT_NAME })
    }

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
        if (sub.currency !== currency) throw new HttpError(400, 'Your plan is paid in another currency. Choose the same currency, or contact Dobry to change it.')
        await s.subscriptions.update(sub.id, { items: [{ id: sub.items.data[0].id, price_data, quantity: charge.quantity }], metadata, proration_behavior: 'create_prorations', cancel_at_period_end: false })
        return json({ changed: true })
      }
    }

    const back = origin(request)
    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      customer,
      client_reference_id: me.orgId,
      line_items: [{ price_data, quantity: charge.quantity }],
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
