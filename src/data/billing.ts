import { auth } from '../lib/auth'
import { takeSource } from '../lib/source'
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
export async function startCheckout(planId: string, currency: Currency, yearly = false, quantity = 1): Promise<'changed' | 'leaving'> {
  const reply = await call<{ url?: string; changed?: boolean }>('/api/checkout', { planId, currency, yearly, quantity })
  if (reply.changed) return 'changed'
  if (!reply.url) throw new Error(t('Payments are not available right now. Please try again later.'))
  window.location.assign(reply.url)
  return 'leaving'
}

export interface Usage {
  lecturers: number
  staff: number
  /** Workplace: the staff there would be with the IDs sent as `adding`. */
  staffWith: number
}

/**
 * Asks the server to count what the organisation uses of its plan and record it. Never fails:
 * with no answer (offline, or the server not set up) it gives null and the app carries on.
 */
export async function refreshUsage(adding: string[] = []): Promise<Usage | null> {
  try {
    const token = await auth.currentUser?.getIdToken()
    if (!token) return null
    const res = await fetch('/api/usage', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ adding }) })
    if (!res.ok) return null
    const data = (await res.json()) as Partial<Usage>
    return typeof data.lecturers === 'number' ? { lecturers: data.lecturers, staff: data.staff ?? 0, staffWith: data.staffWith ?? data.staff ?? 0 } : null
  } catch {
    return null
  }
}

/** Opens Stripe's page for changing the card, seeing invoices or cancelling. */
export async function openBilling(flow?: 'cancel'): Promise<void> {
  const reply = await call<{ url?: string }>('/api/portal', flow ? { flow } : {})
  if (reply.url) window.location.assign(reply.url)
}

/** Undoes a cancellation that has not taken effect yet: the plan renews as before. */
export async function resumePlan(): Promise<void> {
  await call<{ resumed?: boolean }>('/api/portal', { action: 'resume' })
}

/**
 * Has the server read the subscription from Stripe and set the account by it: after coming back
 * from Stripe's page, where a plan may have been cancelled. Never fails; true when it was read.
 */
export async function syncPlan(): Promise<boolean> {
  try {
    return Boolean((await call<{ synced?: boolean }>('/api/portal', { action: 'sync' })).synced)
  } catch {
    return false
  }
}

/** Where an account's invites stand. */
export interface Invites {
  code: string
  link: string
  joined: number
  counted: number
  toGo: number
  rewards: number
  maxRewards: number
  friendsForPro: number
  rewardMonths: number
  proUntil: number | null
}

/** This account's invite link and progress. Asking also counts friends who have started, and gives any Pro earned. */
export const myInvites = () => call<Invites>('/api/referral', { action: 'mine' })

/** A new account says whose invite link it came from. Never fails: a missed invite is not an error for the newcomer. */
export async function claimInvite(code: string): Promise<void> {
  if (!code) return
  try {
    await call('/api/referral', { action: 'claim', code })
  } catch {
    // Not valid, or not new: nothing for them to do about it.
  }
}

/** What the Console is told about the email set-up: never the key itself. */
export interface EmailStatus {
  ready: boolean
  keyEnd: string | null
  keyFromVercel: boolean
  from: string
  replyTo: string
  updatedBy: string | null
  updatedAt: number | null
  tested?: { ok: boolean; error?: string; to?: string }
}

/** The email set-up, for an owner of Dobry: see it, save it, try it, or remove it. */
export const emailSetup = (action: 'status' | 'save' | 'test' | 'clear', fields: { apiKey?: string; from?: string; replyTo?: string } = {}) =>
  call<EmailStatus>('/api/email-settings', { action, ...fields })

/** Asks for the welcome email, after signing up. Never fails: it is a courtesy, not a step. */
export async function sendWelcome(): Promise<void> {
  try {
    const token = await auth.currentUser?.getIdToken()
    if (token) await fetch('/api/welcome', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ source: takeSource() }) })
  } catch {
    // No email this time; nothing else depends on it.
  }
}

/** What the Console is told about the Stripe keys: never the keys themselves. */
export interface PaymentKeysStatus {
  keysFrom: 'console' | 'vercel' | null
  mode: 'live' | 'test' | null
  secretKeySet: boolean
  webhookSecretSet: boolean
  saved: { keyEnd: string | null; webhookEnd: string | null; mode: 'live' | 'test' | null; accountId: string | null; accountName: string | null; updatedBy: string | null; updatedAt: number | null } | null
  webhookUrl: string
  events: string[]
}

/** Reads the state of the Stripe keys, saves new ones, or removes the saved ones. Owners of Dobry only. */
export const paymentKeys = (action: 'status' | 'save' | 'clear', keys: { secretKey?: string; webhookSecret?: string } = {}) =>
  call<PaymentKeysStatus>('/api/stripe-settings', { action, ...keys })

/** Uses a free access code for the signed-in admin's organisation. Replies with when Pro now runs to. */
export const redeemCode = (code: string) => call<{ until: number }>('/api/redeem', { code })

export interface GiftCodeRow {
  code: string
  edition: 'any' | 'lecturers' | 'trainers' | 'workplace'
  months: number
  seats: number
  maxUses: number
  uses: number
  redeemBy: string | null
  note: string
  disabled: boolean
  redeemedBy: string[]
  createdBy: string
  createdAt: number | null
}

/** Free access codes, for Dobry's team: list them, make a batch, or switch one off or on. */
export const giftCodes = (action: 'list' | 'create' | 'disable' | 'enable', body: object = {}) => call<{ codes: GiftCodeRow[] }>('/api/gift-codes', { action, ...body })

export interface FeatureUse {
  certificates: { total: number; last30: number; byOrg: Record<string, number> }
  pay: { companies: number; staff: number; byOrg: Record<string, number> }
}

/** For Dobry's team: certificates issued and companies working out pay. Counts only. */
export const featureUse = () => call<FeatureUse>('/api/feature-use', {})

export interface GrowthTemplate {
  on: boolean
  subject: string
  heading: string
  body: string
  button: string
  path: string
}
export type GrowthStage = 'firstSession' | 'invite' | 'tips' | 'quiet' | 'winback'
export interface GrowthData {
  settings: { dailyCap: number; templates: Record<string, GrowthTemplate> }
  defaults: Record<string, GrowthTemplate>
  stages: { id: GrowthStage; when: string; perEdition: boolean }[]
  stats: Record<GrowthStage, { sent30: number; sentAll: number; cameBack: number; measured: number }>
  unsubscribed: number
  canEdit: boolean
}
export interface FeedbackRow {
  id: string
  orgId: string
  organisation: string
  purpose: string
  name: string
  email: string
  score: number
  comment: string
  quoteOk: boolean
  at: number
}

/** For Dobry's team: the follow-up emails and their results. */
export const growthData = () => call<GrowthData>('/api/growth', { action: 'get' })
export const saveGrowth = (settings: GrowthData['settings']) => call<{ settings: GrowthData['settings'] }>('/api/growth', { action: 'save', settings })
export const testGrowth = (settings: GrowthData['settings'], template: string) => call<{ sent: string }>('/api/growth', { action: 'test', settings, template })
export const feedbackList = () => call<{ feedback: FeedbackRow[] }>('/api/growth', { action: 'feedback' }).then((r) => r.feedback)

export interface SentRow {
  id: string
  orgId: string
  orgName: string
  to: string
  subject: string
  stage: GrowthStage
  template: string
  edition: string
  health: string
  at: number
  cameBack: 'yes' | 'no' | 'pending'
}
export interface CustomerEmail {
  at: number
  kind: 'followUp' | 'account'
  subject: string
  to: string
  stage?: GrowthStage
  health?: string
  cameBack?: SentRow['cameBack']
}

/** Every follow-up sent in the last 90 days, with the customer's health at the time and whether they came back. */
export const sentLog = () => call<{ sent: SentRow[] }>('/api/growth', { action: 'sent' }).then((r) => r.sent)
/** Everything Dobry has emailed one customer. */
export const customerEmails = (orgId: string) => call<{ emails: CustomerEmail[]; unsubscribedAt: number | null }>('/api/growth', { action: 'customer', orgId })
