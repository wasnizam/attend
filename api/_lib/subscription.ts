import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import type Stripe from 'stripe'
import { patchFromSubscription } from './billing.js'
import { emailOrg } from './email.js'
import { withGift } from './gift.js'
import { catalog, firebase } from './server.js'

const auditEntry = (action: string, detail: string, organisationId: string, organisationName?: string) => ({
  actor: 'stripe',
  actorEmail: 'Stripe',
  action,
  detail: detail.slice(0, 1000),
  organisationId,
  organisationName: organisationName ?? '',
  at: FieldValue.serverTimestamp(),
})

/**
 * Sets what the organisation has from its subscription as it is now. Called when Stripe sends
 * word of a change, and also straight after Dobry itself changes a subscription (a switch, a
 * resume) or a customer comes back from Stripe's page, so the account is right at once and does
 * not depend on one message arriving. Doing it twice changes nothing and logs nothing twice.
 */
export async function applySubscription(sub: Stripe.Subscription) {
  const orgId = sub.metadata.orgId
  if (!orgId) return
  const { db } = firebase()
  const ref = db.doc(`organisations/${orgId}`)
  // Since 2025 the period end is on the subscription's item.
  const periodEnd = sub.items.data[0]?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end ?? null
  const paid = patchFromSubscription({ id: sub.id, status: sub.status, periodEnd, currency: sub.currency, metadata: sub.metadata })
  const cancelling = Boolean(sub.cancel_at_period_end || sub.cancel_at)
  // What to tell the customer afterwards, decided inside the step below so it happens once.
  let tell: 'planCancelled' | 'planResumed' | 'planChanged' | 'planEnded' | null = null
  let details: Record<string, string> = {}
  let until = ''
  // In one step, so two messages arriving together change the plan once and log it once.
  await db.runTransaction(async (tx) => {
    tell = null
    const org = (await tx.get(ref)).data()
    if (!org) return
    // A cancelled old subscription must not switch off a newer one the organisation has since bought.
    if (org.stripeSubscriptionId && org.stripeSubscriptionId !== sub.id && !['active', 'trialing', 'past_due'].includes(sub.status)) return
    // Free months from a code still count: Pro runs to the later date, with the larger staff limit.
    const giftUntil: number = org.giftUntil?.toMillis?.() ?? 0
    const p =
      giftUntil > Date.now()
        ? { ...paid, plan: 'pro' as const, paidUntil: Math.max(paid.paidUntil ?? 0, giftUntil), seats: withGift(org.purpose, paid.plan === 'pro' ? paid.seats : undefined, org.giftSeats ?? 0) }
        : paid
    const after = `${p.plan}${p.seats ? `/${p.seats}` : ''}`
    const before = `${org.plan ?? 'early'}${org.seats ? `/${org.seats}` : ''}`
    tx.update(ref, {
      plan: p.plan,
      paidUntil: p.paidUntil ? Timestamp.fromMillis(p.paidUntil) : FieldValue.delete(),
      seats: p.seats ?? FieldValue.delete(),
      price: p.price ?? FieldValue.delete(),
      stripeSubscriptionId: p.stripeSubscriptionId ?? FieldValue.delete(),
      stripeStatus: p.stripeStatus,
      stripePlanId: p.planId ?? FieldValue.delete(),
      // Cancelled for the end of the period, or for a set date: either way it will not renew.
      stripeCancelAtPeriodEnd: cancelling || FieldValue.delete(),
    })
    // Cancelling, or changing their mind, changes no plan yet: it is logged in its own words.
    const was = Boolean(org.stripeCancelAtPeriodEnd)
    until = periodEnd ? new Date(periodEnd * 1000).toISOString().slice(0, 10) : ''
    if (p.plan === 'pro' && cancelling !== was) {
      tx.set(db.collection('platformAudit').doc(), auditEntry('subscription', cancelling ? `Cancelled by the customer: will not renew${until ? `, on until ${until}` : ''}` : 'Resumed by the customer: will renew as before', orgId, org.name))
      tell = cancelling ? 'planCancelled' : 'planResumed'
    }
    if (org.plan === 'pro' && p.plan === 'free' && org.stripeSubscriptionId === sub.id) tell = 'planEnded'
    // The same subscription moved to another plan, another size, or between monthly and yearly.
    if (org.plan === 'pro' && p.plan === 'pro' && org.stripeSubscriptionId === sub.id && (org.stripePlanId !== p.planId || (org.seats ?? null) !== (p.seats ?? null) || org.price?.cycle !== p.price?.cycle)) {
      tell = 'planChanged'
      const people = org.purpose === 'workplace' ? 'staff' : 'lecturers'
      details = {
        planId: p.planId ?? '',
        covers: p.seats ? `${p.seats} ${people}` : '',
        price: p.price ? `${p.price.currency} ${p.price.amount.toFixed(2)} ${p.price.cycle === 'year' ? 'a year' : p.price.cycle === 'semester' ? 'a semester' : 'a month'}` : '',
      }
    }
    if (before !== after || org.stripeStatus !== p.stripeStatus) {
      tx.set(db.collection('platformAudit').doc(), auditEntry('subscription', `${before} → ${after} (${p.stripeStatus}${p.paidUntil ? `, until ${new Date(p.paidUntil).toDateString()}` : ''})`, orgId, org.name))
    }
  })
  // Each time it happens, not once ever: someone may cancel, resume and cancel again.
  const kind = tell as 'planCancelled' | 'planResumed' | 'planChanged' | 'planEnded' | null
  if (!kind) return
  const data: Record<string, string> = { until, ...details }
  if (kind === 'planChanged' && details.planId) {
    // The plan's name as customers know it, from the price list.
    const plans = Object.values(await catalog(db).catch(() => ({}))).flat() as { id: string; name: string }[]
    data.plan = plans.find((x) => x.id === details.planId)?.name ?? ''
  }
  await emailOrg(db, orgId, kind, data, `${kind}_${sub.id}_${Date.now()}`).catch(() => {})
}

