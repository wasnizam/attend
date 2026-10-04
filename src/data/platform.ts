import { Timestamp, collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { Organisation, Session, UserProfile, WeeklyClass } from '../lib/types'

// The owner of Attend (not a customer's admin) sees every customer here. The rules allow it only for
// accounts listed in platformOwners, which is filled in by hand in the Firebase console.

/** Whether this account runs Attend itself. */
export async function isPlatformOwner(uid: string): Promise<boolean> {
  try {
    return (await getDoc(doc(db, 'platformOwners', uid))).exists()
  } catch {
    return false
  }
}

export function subscribeAllOrganisations(onData: (orgs: Organisation[]) => void, onError: (e: Error) => void) {
  return onSnapshot(collection(db, 'organisations'), (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Organisation)), onError)
}

export async function fetchAllUsers(): Promise<UserProfile[]> {
  return (await getDocs(collection(db, 'users'))).docs.map((d) => ({ id: d.id, ...d.data() }) as UserProfile)
}

/** Every day opened since a date, across all customers: for activity. */
export async function fetchSessionsSince(date: string): Promise<Pick<Session, 'id' | 'organisationId' | 'date' | 'status'>[]> {
  const snap = await getDocs(query(collection(db, 'sessions'), where('date', '>=', date)))
  return snap.docs.map((d) => ({ id: d.id, organisationId: d.data().organisationId, date: d.data().date, status: d.data().status }))
}

export async function fetchAllClasses(): Promise<Pick<WeeklyClass, 'id' | 'organisationId' | 'rosterCount' | 'rosterFrom'>[]> {
  const snap = await getDocs(collection(db, 'classes'))
  return snap.docs.map((d) => ({ id: d.id, organisationId: d.data().organisationId, rosterCount: d.data().rosterCount, rosterFrom: d.data().rosterFrom }))
}

/** The customer's most recent opened day, however long ago. */
export async function fetchLastActivity(organisationId: string): Promise<string | null> {
  const snap = await getDocs(query(collection(db, 'sessions'), where('organisationId', '==', organisationId), orderBy('date', 'desc')))
  return snap.docs.find((d) => d.data().status !== 'scheduled')?.data().date ?? null
}

export interface BillingEntry {
  id: string
  organisationId: string
  organisationName?: string
  kind: 'payment' | 'change'
  amount?: number
  currency?: 'MYR' | 'USD'
  method?: string
  note?: string
  by: string
  at: Timestamp | null
}

export function subscribeBilling(onData: (entries: BillingEntry[]) => void, onError: (e: Error) => void) {
  return onSnapshot(
    collection(db, 'billing'),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BillingEntry).sort((a, b) => (b.at?.toMillis() ?? Date.now()) - (a.at?.toMillis() ?? Date.now()))),
    onError,
  )
}

export type CustomerPatch = Partial<Pick<Organisation, 'plan' | 'seats'>> & {
  trialStarted?: Timestamp | null
  paidUntil?: Timestamp | null
  suspended?: boolean
  ownerNote?: string
}

/** Changes what a customer has, and writes the change in the book in the same step. */
export async function updateCustomer(org: Organisation, patch: CustomerPatch, by: string, note: string) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'organisations', org.id), patch)
  if (note) batch.set(doc(collection(db, 'billing')), { organisationId: org.id, organisationName: org.name, kind: 'change', amount: 0, note: note.slice(0, 500), by, at: serverTimestamp() })
  await batch.commit()
}

/** A payment received outside the app (bank transfer, DuitNow...), optionally extending Pro. */
export async function recordPayment(
  org: Organisation,
  payment: { amount: number; currency: 'MYR' | 'USD'; method: string; note: string },
  by: string,
  extend?: { paidUntil: Timestamp; seats?: number },
) {
  const batch = writeBatch(db)
  batch.set(doc(collection(db, 'billing')), { organisationId: org.id, organisationName: org.name, kind: 'payment', amount: payment.amount, currency: payment.currency, method: payment.method, note: payment.note.slice(0, 500), by, at: serverTimestamp() })
  if (extend) batch.update(doc(db, 'organisations', org.id), { plan: 'pro', paidUntil: extend.paidUntil, ...(extend.seats !== undefined ? { seats: extend.seats } : {}) })
  await batch.commit()
}
