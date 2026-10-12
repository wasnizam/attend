import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import type Stripe from 'stripe'
import { emailOrg } from './_lib/email.js'
import { applySubscription } from './_lib/subscription.js'
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
          await applySubscription(await s.subscriptions.retrieve(typeof session.subscription === 'string' ? session.subscription : session.subscription.id))
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        // Read it again from Stripe, so an old event arriving late cannot undo a newer one.
        await applySubscription(await s.subscriptions.retrieve(event.data.object.id))
        break
      case 'invoice.paid':
        await paid(event.data.object)
        await failure_(event.data.object, false)
        break
      case 'invoice.payment_failed':
        await note(event.data.object.customer, 'payment failed', `Stripe could not take ${money(event.data.object.amount_due, event.data.object.currency)}. Stripe will try again.`)
        await failure_(event.data.object, true)
        break
    }
    return json({ received: true })
  } catch (e) {
    return failure(e)
  }
}

const money = (minor: number, currency: string) => `${currency.toUpperCase()} ${(minor / 100).toFixed(2)}`

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
  // Dobry's own receipt, once per invoice: the Stripe account may serve other businesses, so its
  // own customer emails are left as they are.
  const end = invoice.lines?.data?.[0]?.period?.end
  await emailOrg(
    db,
    org.id,
    'paymentReceived',
    {
      amount: money(invoice.amount_paid, invoice.currency),
      number: invoice.number ?? '',
      until: end ? new Date(end * 1000).toISOString().slice(0, 10) : '',
      invoiceUrl: invoice.hosted_invoice_url ?? '',
    },
    `paid_${invoice.id}`,
  ).catch(() => {})
}

/**
 * Keeps on the organisation what the Console shows under "Payment failed": how much, which try it
 * was and when Stripe will try again. A payment that goes through clears it.
 */
async function failure_(invoice: Stripe.Invoice, failed: boolean) {
  const customer = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
  if (!customer) return
  const { db } = firebase()
  const org = (await db.collection('organisations').where('stripeCustomerId', '==', customer).limit(1).get()).docs[0]
  if (!org) return
  if (!failed) {
    if (org.data().paymentFailure) await org.ref.update({ paymentFailure: FieldValue.delete() })
    return
  }
  const first = !org.data().paymentFailure
  await org.ref.update({
    paymentFailure: {
      at: FieldValue.serverTimestamp(),
      amount: invoice.amount_due / 100,
      currency: invoice.currency.toUpperCase() === 'MYR' ? 'MYR' : 'USD',
      attempt: invoice.attempt_count ?? 1,
      nextTry: invoice.next_payment_attempt ? Timestamp.fromMillis(invoice.next_payment_attempt * 1000) : null,
    },
  })
  // Tell the customer once, on the first failure, with the way to fix it.
  if (first) {
    await emailOrg(db, org.id, 'paymentFailed', {
      amount: money(invoice.amount_due, invoice.currency),
      retry: invoice.next_payment_attempt ? new Date(invoice.next_payment_attempt * 1000).toISOString().slice(0, 10) : '',
    }).catch(() => {})
  }
}

async function note(customer: Stripe.Invoice['customer'], action: string, detail: string) {
  const id = typeof customer === 'string' ? customer : customer?.id
  if (!id) return
  const { db } = firebase()
  const org = (await db.collection('organisations').where('stripeCustomerId', '==', id).limit(1).get()).docs[0]
  if (org) await audit(db, action, detail, org.id, org.data().name)
}

const auditEntry = (action: string, detail: string, organisationId: string, organisationName?: string) => ({
  actor: 'stripe',
  actorEmail: 'Stripe',
  action,
  detail: detail.slice(0, 1000),
  organisationId,
  organisationName: organisationName ?? '',
  at: FieldValue.serverTimestamp(),
})
const audit = (db: FirebaseFirestore.Firestore, action: string, detail: string, organisationId: string, organisationName?: string) =>
  db.collection('platformAudit').add(auditEntry(action, detail, organisationId, organisationName))
