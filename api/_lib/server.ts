import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { type Firestore, getFirestore } from 'firebase-admin/firestore'
import Stripe from 'stripe'
import { type Catalog, type EditionId } from './billing.js'
import { DEFAULT_CATALOG } from './catalog.default.js'

/** Thrown when a setting is missing on the server: the function answers 503 instead of crashing. */
export class NotConfigured extends Error {}

/** A reply the customer's screen can show. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

/** Turns whatever went wrong into a reply, without leaking details of the server. */
export function failure(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: e.message }, e.status)
  if (e instanceof NotConfigured) return json({ error: 'Payments are not set up yet.' }, 503)
  console.error(e)
  return json({ error: 'Something went wrong. Please try again.' }, 500)
}

/** Firebase with full access: only ever used on the server, to read who is asking and to mark an organisation as paid. */
export function firebase(): { db: Firestore; auth: ReturnType<typeof getAuth> } {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim()
    if (!raw) throw new NotConfigured('FIREBASE_SERVICE_ACCOUNT')
    // Pasted as the JSON file's text, or as that text in base64.
    const text = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')
    initializeApp({ credential: cert(JSON.parse(text)) })
  }
  return { db: getFirestore(), auth: getAuth() }
}

/** Where the Stripe keys are kept: a place in the database that no browser can read or write. */
export const STRIPE_SECRETS = 'platformSecrets/stripe'

export interface StripeSettings {
  secretKey: string
  webhookSecret: string
  /** Entered in the Console, or set in Vercel's settings. */
  source: 'console' | 'vercel' | null
}

let settings: { at: number; value: StripeSettings } | null = null

/**
 * The Stripe keys in use: the ones saved from the Console, or else the ones in Vercel's settings.
 * Remembered for a minute, so a changed key is picked up everywhere within that time.
 */
export async function stripeSettings(fresh = false): Promise<StripeSettings> {
  if (!fresh && settings && Date.now() - settings.at < 60_000) return settings.value
  let saved: { secretKey?: string; webhookSecret?: string } = {}
  try {
    saved = (await firebase().db.doc(STRIPE_SECRETS).get()).data() ?? {}
  } catch (e) {
    // Without the Firebase key there is nowhere to look; the Vercel settings still work.
    if (!(e instanceof NotConfigured)) throw e
  }
  const secretKey = saved.secretKey || process.env.STRIPE_SECRET_KEY?.trim() || ''
  const value: StripeSettings = {
    secretKey,
    webhookSecret: saved.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET?.trim() || '',
    source: saved.secretKey ? 'console' : secretKey ? 'vercel' : null,
  }
  settings = { at: Date.now(), value }
  return value
}

/** Forgets the remembered keys, after they are changed. */
export const forgetStripeSettings = () => {
  settings = null
}

const clients = new Map<string, Stripe>()
export const stripeFor = (key: string): Stripe => {
  if (!clients.has(key)) clients.set(key, new Stripe(key))
  return clients.get(key)!
}

export async function stripe(): Promise<Stripe> {
  const { secretKey } = await stripeSettings()
  if (!secretKey) throw new NotConfigured('STRIPE_SECRET_KEY')
  return stripeFor(secretKey)
}

/** live or test, going by the key. */
export const modeOf = (key: string): 'live' | 'test' | null => (/^(sk|rk)_live_/.test(key) ? 'live' : key ? 'test' : null)

export interface Caller {
  uid: string
  email: string
  orgId: string
  org: FirebaseFirestore.DocumentData
}

/** Who is asking: a signed-in admin of an organisation, proven by their Firebase sign-in. */
export async function caller(request: Request): Promise<Caller> {
  const token = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1]
  if (!token) throw new HttpError(401, 'Please log in again.')
  const { db, auth } = firebase()
  const decoded = await auth.verifyIdToken(token).catch(() => null)
  if (!decoded) throw new HttpError(401, 'Please log in again.')
  const user = (await db.doc(`users/${decoded.uid}`).get()).data()
  if (!user?.organisationId || user.status !== 'active') throw new HttpError(403, 'Your account cannot do this.')
  if (user.role !== 'admin') throw new HttpError(403, 'Only an admin of your organisation can change the plan.')
  const org = (await db.doc(`organisations/${user.organisationId}`).get()).data()
  if (!org) throw new HttpError(404, 'Organisation not found.')
  if (org.suspended) throw new HttpError(403, 'This account is suspended. Contact Attend.')
  return { uid: decoded.uid, email: decoded.email ?? user.email ?? '', orgId: user.organisationId, org }
}

const EDITIONS: EditionId[] = ['lecturers', 'trainers', 'workplace']

/** The price list from the Console, or the one in the code when none has been saved. */
export async function catalog(db: Firestore): Promise<Catalog> {
  const saved = (await db.doc('platformConfig/pricing').get()).data() ?? {}
  return Object.fromEntries(EDITIONS.map((e) => [e, Array.isArray(saved[e]) && saved[e].length ? saved[e] : DEFAULT_CATALOG[e]])) as Catalog
}

/** Where to send the customer back to: this same website. */
export const origin = (request: Request) => (process.env.SITE_URL?.trim() || new URL(request.url).origin).replace(/\/$/, '')
