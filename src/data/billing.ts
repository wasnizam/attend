import { auth } from '../lib/auth'
import type { Currency } from '../lib/currency'
import { t } from '../lib/i18n'

/** Calls the payment server as the signed-in person. The server decides the price; the browser only names the plan. */
async function call<T>(path: string, body: object): Promise<T> {
  const token = await auth.currentUser?.getIdToken()
  let res: Response
  try {
    res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token ?? ''}` }, body: JSON.stringify(body) })
  } catch {
    throw new Error(t('We could not reach the payment page. Check your connection and try again.'))
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(data.error ? t(data.error) : t('Payments are not available right now. Please try again later.'))
  return data as T
}

/**
 * Starts paying for a plan: the customer is sent to Stripe's payment page. Someone who already
 * pays is moved to the new plan straight away instead (`changed`).
 */
export async function startCheckout(planId: string, currency: Currency, yearly = false): Promise<'changed' | 'leaving'> {
  const reply = await call<{ url?: string; changed?: boolean }>('/api/checkout', { planId, currency, yearly })
  if (reply.changed) return 'changed'
  if (!reply.url) throw new Error(t('Payments are not available right now. Please try again later.'))
  window.location.assign(reply.url)
  return 'leaving'
}

/** Opens Stripe's page for changing the card, seeing invoices or cancelling. */
export async function openBilling(): Promise<void> {
  const reply = await call<{ url?: string }>('/api/portal', {})
  if (reply.url) window.location.assign(reply.url)
}
