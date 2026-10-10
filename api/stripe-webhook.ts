import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import type Stripe from 'stripe'
import { patchFromSubscription } from './_lib/billing.js'
import { NotConfigured, failure, firebase, json, stripe, stripeFor, stripeSettings } from './_lib/server.js'

/**
 * Stripe calls this whenever something happens to a payment or a subscription. It is the only
 * thing that marks an organisation as paid. Every call is checked against Stripe's signature, so
 * nobody else can pretend to be Stripe, and handling the same event twice changes nothing.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.text()
    const signature = request.headers.get('stripe-signature') ?? ''
    let event: Stripe.Event | null = null
    // A key changed a moment ago may not be known here yet: on a bad signature, look once more.
    for (const fresh of [false, true]) {
      const { secretKey, webhookSecret } = await stripeSettings(fresh)
      if (!secretKey || !webhookSecret) throw new NotConfigured('STRIPE_WEBHOOK_SECRET')
      event = await stripeFor(secretKey).webhooks.constructEventAsync(body, signature, webhookSecret).catch(() => null)
      if (event) break
    }
    if (!event) return json({ error: 'Bad signature.' }, 400)
    const s = await stripe()

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        if (session.mode === 'subscription' && session.subscription) {
          await apply(await s.subscriptions.retrieve(typeof session.subscription === 'string' ? session.subscription : session.subscription.id))
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        // Read it again from Stripe, so an old event arriving late cannot undo a newer one.
        await apply(await s.subscriptions.retrieve(event.data.object.id))
        break
      case 'invoice.paid':
        await paid(event.data.object)
        break
      case 'invoice.payment_failed':
        await note(event.data.object.customer, 'payment failed', `Stripe could not take ${money(event.data.object.amount_due, event.data.object.currency)}. Stripe will try again.`)
        break
    }
    return json({ received: true })
  } catch (e) {
    return failure(e)
  }
}

const money = (minor: number, currency: string) => `${currency.toUpperCase()} ${(minor / 100).toFixed(2)}`

/** Sets what the organisation has from its subscription as it is now. */
async function apply(sub: Stripe.Subscription) {
  const orgId = sub.metadata.orgId
  if (!orgId) return
  const { db } = firebase()
  const ref = db.doc(`organisations/${orgId}`)
  const org = (await ref.get()).data()
  if (!org) return
  // A cancelled old subscription must not switch off a newer one the organisation has since bought.
  if (org.stripeSubscriptionId && org.stripeSubscriptionId !== sub.id && !['active', 'trialing', 'past_due'].includes(sub.status)) return

  // Since 2025 the period end is on the subscription's item.
  const periodEnd = sub.items.data[0]?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end ?? null
  const p = patchFromSubscription({ id: sub.id, status: sub.status, periodEnd, currency: sub.currency, metadata: sub.metadata })
  const before = `${org.plan ?? 'early'}${org.seats ? `/${org.seats}` : ''}`
  await ref.update({
    plan: p.plan,
    paidUntil: p.paidUntil ? Timestamp.fromMillis(p.paidUntil) : FieldValue.delete(),
    seats: p.seats ?? FieldValue.delete(),
    price: p.price ?? FieldValue.delete(),
    stripeSubscriptionId: p.stripeSubscriptionId ?? FieldValue.delete(),
    stripeStatus: p.stripeStatus,
    stripePlanId: p.planId ?? FieldValue.delete(),
    stripeCancelAtPeriodEnd: sub.cancel_at_period_end || FieldValue.delete(),
  })
  const after = `${p.plan}${p.seats ? `/${p.seats}` : ''}`
  if (before !== after || org.stripeStatus !== p.stripeStatus) {
    await audit(db, 'subscription', `${before} → ${after} (${p.stripeStatus}${p.paidUntil ? `, until ${new Date(p.paidUntil).toDateString()}` : ''})`, orgId, org.name)
  }
}

/** A payment that went through: one line in the billing history, written once per Stripe invoice. */
async function paid(invoice: Stripe.Invoice) {
  if (!invoice.amount_paid) return
  const { db } = firebase()
  const customer = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
  if (!customer) return
  const found = await db.collection('organisations').where('stripeCustomerId', '==', customer).limit(1).get()
  const org = found.docs[0]
  if (!org) return
  const ref = db.doc(`billing/stripe_${invoice.id}`)
  if ((await ref.get()).exists) return
  await ref.set({
    organisationId: org.id,
    organisationName: org.data().name ?? '',
    kind: 'payment',
    amount: invoice.amount_paid / 100,
    currency: invoice.currency.toUpperCase() === 'MYR' ? 'MYR' : 'USD',
    method: 'Stripe',
    note: `Stripe invoice ${invoice.number ?? invoice.id}`,
    by: 'stripe',
    at: FieldValue.serverTimestamp(),
  })
  await audit(db, 'payment', `${money(invoice.amount_paid, invoice.currency)} by Stripe (${invoice.number ?? invoice.id})`, org.id, org.data().name)
}

async function note(customer: Stripe.Invoice['customer'], action: string, detail: string) {
  const id = typeof customer === 'string' ? customer : customer?.id
  if (!id) return
  const { db } = firebase()
  const org = (await db.collection('organisations').where('stripeCustomerId', '==', id).limit(1).get()).docs[0]
  if (org) await audit(db, action, detail, org.id, org.data().name)
}

const audit = (db: FirebaseFirestore.Firestore, action: string, detail: string, organisationId: string, organisationName?: string) =>
  db.collection('platformAudit').add({ actor: 'stripe', actorEmail: 'Stripe', action, detail: detail.slice(0, 1000), organisationId, organisationName: organisationName ?? '', at: FieldValue.serverTimestamp() })
