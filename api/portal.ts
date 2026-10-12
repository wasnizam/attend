import { HttpError, caller, failure, json, origin, stripe } from './_lib/server.js'

const missing = (e: unknown) => (e as { code?: string })?.code === 'resource_missing'

/**
 * Opens Stripe's own page where a customer changes their card, sees invoices, or cancels.
 * `flow: 'cancel'` goes straight to the cancel step; `action: 'resume'` undoes a cancellation
 * that has not taken effect yet, with no page to visit.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const me = await caller(request)
    if (!me.org.stripeCustomerId) throw new HttpError(400, 'There is no paid plan to manage yet.')
    const body = (await request.json().catch(() => ({}))) as { flow?: unknown; action?: unknown }
    const s = await stripe()
    const subscription: string | undefined = me.org.stripeSubscriptionId

    if (body.action === 'resume') {
      if (!subscription) throw new HttpError(400, 'There is no paid plan to resume.')
      const sub = await s.subscriptions.retrieve(subscription).catch((e) => {
        if (!missing(e)) throw e
        return null
      })
      if (!sub || !['active', 'trialing', 'past_due'].includes(sub.status)) throw new HttpError(400, 'That plan has already ended. Choose a plan to start again.')
      // Stripe records a cancellation either as "at the end of the period" or as a date; clear whichever it used.
      await s.subscriptions.update(subscription, sub.cancel_at && !sub.cancel_at_period_end ? { cancel_at: '' } : { cancel_at_period_end: false })
      return json({ resumed: true })
    }

    const back = `${origin(request)}/app/account`
    const session = await s.billingPortal.sessions.create({
      customer: me.org.stripeCustomerId,
      return_url: back,
      ...(body.flow === 'cancel' && subscription
        ? { flow_data: { type: 'subscription_cancel' as const, subscription_cancel: { subscription }, after_completion: { type: 'redirect' as const, redirect: { return_url: back } } } }
        : {}),
    })
    return json({ url: session.url })
  } catch (e) {
    return failure(e)
  }
}
