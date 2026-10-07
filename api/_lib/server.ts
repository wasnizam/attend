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

let client: Stripe | null = null
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) throw new NotConfigured('STRIPE_SECRET_KEY')
  client ??= new Stripe(key)
  return client
}

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
