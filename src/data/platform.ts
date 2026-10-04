import { sendPasswordResetEmail } from 'firebase/auth'
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { auth } from '../lib/auth'
import { db } from '../lib/firebase'
import type { Organisation, Session, UserProfile, WeeklyClass } from '../lib/types'

// Attend's own back office. The rules allow these reads and writes only to the team listed in
// platformOwners, each by role (see firestore.rules). Customers never reach any of it.

export type StaffRole = 'owner' | 'admin' | 'finance' | 'support' | 'viewer'
export const STAFF_ROLES: StaffRole[] = ['owner', 'admin', 'finance', 'support', 'viewer']
export const ROLE_LABEL: Record<StaffRole, string> = { owner: 'Owner', admin: 'Admin', finance: 'Finance', support: 'Support', viewer: 'Viewer' }
export const ROLE_HELP: Record<StaffRole, string> = {
  owner: 'Everything, including the team.',
  admin: 'Everything except the team: suspend, users, announcements, settings, audit log.',
  finance: 'Plans, prices, invoices, payments and refunds.',
  support: 'Notes, tasks, tags, trial days and password resets.',
  viewer: 'Can look at everything, change nothing.',
}

/** What each part of the back office needs. Mirrors the rules, so buttons match what will save. */
export const CAN = {
  money: ['owner', 'admin', 'finance'],
  suspend: ['owner', 'admin'],
  support: ['owner', 'admin', 'finance', 'support'],
  users: ['owner', 'admin'],
  team: ['owner'],
  settings: ['owner', 'admin'],
  announce: ['owner', 'admin'],
  audit: ['owner', 'admin'],
} satisfies Record<string, StaffRole[]>
export const can = (role: StaffRole | null | undefined, what: keyof typeof CAN) => Boolean(role && (CAN[what] as StaffRole[]).includes(role))

export interface StaffMember {
  id: string
  email: string
  name?: string
  role: StaffRole
  addedAt?: Timestamp | null
  addedBy?: string
}

/** This account's role in the back office, or null when it is not on the team. */
export async function staffRoleOf(uid: string): Promise<StaffRole | null> {
  try {
    const snap = await getDoc(doc(db, 'platformOwners', uid))
    return snap.exists() ? ((snap.data().role as StaffRole | undefined) ?? 'owner') : null
  } catch {
    return null
  }
}

/** Whether this account runs Attend itself (any role). */
export const isPlatformOwner = async (uid: string) => (await staffRoleOf(uid)) !== null

/** Takes up an invitation sent to this (verified) email. Returns the role, or null when there is none. */
export async function claimInvite(uid: string, email: string): Promise<StaffRole | null> {
  const key = email.toLowerCase()
  try {
    const invite = await getDoc(doc(db, 'platformInvites', key))
    if (!invite.exists()) return null
    const role = invite.data().role as StaffRole
    await setDoc(doc(db, 'platformOwners', uid), { email: key, role, addedAt: serverTimestamp(), addedBy: invite.data().invitedBy ?? '' })
    await deleteDoc(invite.ref).catch(() => {})
    return role
  } catch {
    return null
  }
}

// ---------- reading everything ----------

const live = <T>(path: string, map: (d: { id: string; data(): object }) => T) => (onData: (rows: T[]) => void, onError: (e: Error) => void) =>
  onSnapshot(collection(db, path), (snap) => onData(snap.docs.map(map)), onError)

export const subscribeAllOrganisations = live<Organisation>('organisations', (d) => ({ id: d.id, ...d.data() }) as Organisation)
export const subscribeAllUsers = live<UserProfile>('users', (d) => ({ id: d.id, ...d.data() }) as UserProfile)
export const subscribeTeam = live<StaffMember>('platformOwners', (d) => ({ id: d.id, role: 'owner', ...d.data() }) as StaffMember)
export const subscribeInvites = live<{ id: string; role: StaffRole; invitedBy?: string; at?: Timestamp }>('platformInvites', (d) => ({ id: d.id, ...d.data() }) as never)

/** Every day opened since a date, across all customers: for activity and health. */
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

// ---------- audit ----------

export interface AuditEntry {
  id: string
  actor: string
  actorEmail?: string
  action: string
  organisationId?: string
  organisationName?: string
  detail?: string
  at: Timestamp | null
}
export const subscribeAudit = live<AuditEntry>('platformAudit', (d) => ({ id: d.id, ...d.data() }) as AuditEntry)

export interface Actor {
  id: string
  email: string
}
const auditDoc = (me: Actor, action: string, detail: string, org?: Pick<Organisation, 'id' | 'name'>) => ({
  actor: me.id,
  actorEmail: me.email,
  action,
  detail: detail.slice(0, 1000),
  ...(org ? { organisationId: org.id, organisationName: org.name } : {}),
  at: serverTimestamp(),
})
export const audit = (me: Actor, action: string, detail: string, org?: Pick<Organisation, 'id' | 'name'>) => setDoc(doc(collection(db, 'platformAudit')), auditDoc(me, action, detail, org))

// ---------- customers ----------

export interface Price {
  amount: number
  currency: 'MYR' | 'USD'
  cycle: 'month' | 'semester' | 'year'
}
/** A price as money per month, for recurring revenue. A semester counts as six months. */
export const monthly = (p: Price) => (p.cycle === 'month' ? p.amount : p.cycle === 'semester' ? p.amount / 6 : p.amount / 12)

export type CustomerPatch = Partial<Pick<Organisation, 'plan' | 'seats' | 'tags' | 'accountManager' | 'price'>> & {
  trialStarted?: Timestamp | null
  paidUntil?: Timestamp | null
  suspended?: boolean
  ownerNote?: string
}

/** Changes what a customer has, and writes it in the audit log in the same step. */
export async function updateCustomer(org: Organisation, patch: CustomerPatch, me: Actor, action: string, detail: string) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'organisations', org.id), patch)
  batch.set(doc(collection(db, 'platformAudit')), auditDoc(me, action, detail, org))
  await batch.commit()
}

// ---------- money ----------

export interface BillingEntry {
  id: string
  organisationId: string
  organisationName?: string
  kind: 'payment' | 'refund' | 'change'
  amount?: number
  currency?: 'MYR' | 'USD'
  method?: string
  note?: string
  invoiceId?: string
  by: string
  at: Timestamp | null
}
export const subscribeBilling = live<BillingEntry>('billing', (d) => ({ id: d.id, ...d.data() }) as BillingEntry)

/** Money received outside the app (transfer, DuitNow...), optionally paying an invoice and extending Pro. */
export async function recordPayment(
  org: Organisation,
  payment: { amount: number; currency: 'MYR' | 'USD'; method: string; note: string; invoiceId?: string },
  me: Actor,
  extend?: { paidUntil: Timestamp; seats?: number },
) {
  const batch = writeBatch(db)
  const pay = doc(collection(db, 'billing'))
  batch.set(pay, { organisationId: org.id, organisationName: org.name, kind: 'payment', amount: payment.amount, currency: payment.currency, method: payment.method, note: payment.note.slice(0, 500), ...(payment.invoiceId ? { invoiceId: payment.invoiceId } : {}), by: me.id, at: serverTimestamp() })
  if (payment.invoiceId) batch.update(doc(db, 'invoices', payment.invoiceId), { status: 'paid', paidAt: serverTimestamp(), paymentId: pay.id })
  if (extend) batch.update(doc(db, 'organisations', org.id), { plan: 'pro', paidUntil: extend.paidUntil, ...(extend.seats !== undefined ? { seats: extend.seats } : {}) })
  batch.set(doc(collection(db, 'platformAudit')), auditDoc(me, 'payment', `${payment.currency} ${payment.amount} by ${payment.method}${payment.invoiceId ? ' (invoice)' : ''}${extend ? `, Pro until ${extend.paidUntil.toDate().toDateString()}` : ''}`, org))
  await batch.commit()
}

export async function recordRefund(org: Organisation, refund: { amount: number; currency: 'MYR' | 'USD'; method: string; note: string }, me: Actor) {
  const batch = writeBatch(db)
  batch.set(doc(collection(db, 'billing')), { organisationId: org.id, organisationName: org.name, kind: 'refund', amount: refund.amount, currency: refund.currency, method: refund.method, note: refund.note.slice(0, 500), by: me.id, at: serverTimestamp() })
  batch.set(doc(collection(db, 'platformAudit')), auditDoc(me, 'refund', `${refund.currency} ${refund.amount}: ${refund.note}`, org))
  await batch.commit()
}

export interface InvoiceItem {
  description: string
  qty: number
  unitPrice: number
}
export interface Invoice {
  id: string
  number: string
  organisationId: string
  organisationName: string
  billTo: { name: string; email: string; address?: string }
  items: InvoiceItem[]
  currency: 'MYR' | 'USD'
  taxRate: number
  subtotal: number
  tax: number
  total: number
  issueDate: string
  dueDate: string
  status: 'unpaid' | 'paid' | 'void'
  note?: string
  voidReason?: string
  paidAt?: Timestamp | null
  paymentId?: string
  by: string
  at: Timestamp | null
}
export const subscribeInvoices = live<Invoice>('invoices', (d) => ({ id: d.id, ...d.data() }) as Invoice)

export const invoiceTotals = (items: InvoiceItem[], taxRate: number) => {
  const subtotal = Math.round(items.reduce((a, i) => a + i.qty * i.unitPrice, 0) * 100) / 100
  const tax = Math.round(subtotal * taxRate) / 100
  return { subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100 }
}

/** Issues the next numbered invoice (the counter and the invoice are written together). */
export async function createInvoice(org: Organisation, draft: Omit<Invoice, 'id' | 'number' | 'organisationId' | 'organisationName' | 'subtotal' | 'tax' | 'total' | 'status' | 'by' | 'at'>, prefix: string, me: Actor): Promise<string> {
  const counter = doc(db, 'platformConfig', 'counters')
  const ref = doc(collection(db, 'invoices'))
  const number = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counter)
    const next = (snap.exists() ? (snap.data().invoice as number) : 0) + 1
    if (snap.exists()) tx.update(counter, { invoice: next })
    else tx.set(counter, { invoice: 1 })
    const no = `${prefix || 'INV'}-${draft.issueDate.slice(0, 4)}-${String(next).padStart(4, '0')}`
    tx.set(ref, { ...draft, ...invoiceTotals(draft.items, draft.taxRate), number: no, organisationId: org.id, organisationName: org.name, status: 'unpaid', by: me.id, at: serverTimestamp() })
    return no
  })
  await audit(me, 'invoice', `Issued ${number}`, org)
  return number
}

export async function voidInvoice(inv: Invoice, reason: string, me: Actor) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'invoices', inv.id), { status: 'void', voidReason: reason.slice(0, 300) })
  batch.set(doc(collection(db, 'platformAudit')), auditDoc(me, 'invoice', `Voided ${inv.number}: ${reason}`, { id: inv.organisationId, name: inv.organisationName }))
  await batch.commit()
}

// ---------- support ----------

export interface CustomerNote {
  id: string
  organisationId: string
  text: string
  by: string
  byEmail?: string
  at: Timestamp | null
}
export const subscribeNotes = live<CustomerNote>('customerNotes', (d) => ({ id: d.id, ...d.data() }) as CustomerNote)
export const addNote = (org: Organisation, text: string, me: Actor) =>
  setDoc(doc(collection(db, 'customerNotes')), { organisationId: org.id, organisationName: org.name, text: text.slice(0, 4000), by: me.id, byEmail: me.email, at: serverTimestamp() })

export interface Task {
  id: string
  title: string
  due: string
  organisationId?: string
  organisationName?: string
  assignee?: string
  assigneeEmail?: string
  done: boolean
  doneAt?: Timestamp | null
  by: string
  at: Timestamp | null
}
export const subscribeTasks = live<Task>('platformTasks', (d) => ({ id: d.id, ...d.data() }) as Task)
export const addTask = (task: Pick<Task, 'title' | 'due' | 'assignee' | 'assigneeEmail'>, me: Actor, org?: Organisation) =>
  setDoc(doc(collection(db, 'platformTasks')), { ...task, ...(org ? { organisationId: org.id, organisationName: org.name } : {}), done: false, by: me.id, at: serverTimestamp() })
export const setTaskDone = (task: Task, done: boolean) => updateDoc(doc(db, 'platformTasks', task.id), { done, doneAt: done ? serverTimestamp() : null })
export const removeTask = (task: Task) => deleteDoc(doc(db, 'platformTasks', task.id))

/** Sends the person Firebase's own password-reset email. */
export async function resetPassword(user: UserProfile, me: Actor) {
  await sendPasswordResetEmail(auth, user.email)
  await audit(me, 'user', `Password reset email sent to ${user.email}`)
}

export async function setUserStatus(user: UserProfile, status: 'active' | 'disabled', me: Actor) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'users', user.id), { status })
  batch.set(doc(collection(db, 'platformAudit')), auditDoc(me, 'user', `${status === 'disabled' ? 'Disabled' : 'Enabled'} ${user.email}`))
  await batch.commit()
}

// ---------- team ----------

export async function inviteStaff(email: string, role: StaffRole, me: Actor) {
  const key = email.trim().toLowerCase()
  await setDoc(doc(db, 'platformInvites', key), { role, invitedBy: me.id, at: serverTimestamp() })
  await audit(me, 'team', `Invited ${key} as ${role}`)
}
export async function cancelInvite(email: string, me: Actor) {
  await deleteDoc(doc(db, 'platformInvites', email))
  await audit(me, 'team', `Cancelled the invitation for ${email}`)
}
export async function changeRole(member: StaffMember, role: StaffRole, me: Actor) {
  await updateDoc(doc(db, 'platformOwners', member.id), { role, email: member.email })
  await audit(me, 'team', `${member.email}: ${member.role} → ${role}`)
}
export async function removeStaff(member: StaffMember, me: Actor) {
  await deleteDoc(doc(db, 'platformOwners', member.id))
  await audit(me, 'team', `Removed ${member.email}`)
}

// ---------- announcements ----------

export interface Announcement {
  id: string
  title: string
  body: string
  level: 'info' | 'warning'
  audience: 'all' | 'education' | 'training' | 'workplace'
  from: string
  to: string
  active: boolean
  at?: Timestamp | null
}
export const subscribeAnnouncements = live<Announcement>('announcements', (d) => ({ id: d.id, ...d.data() }) as Announcement)
export async function saveAnnouncement(a: Omit<Announcement, 'id' | 'at'> & { id?: string }, me: Actor) {
  const ref = a.id ? doc(db, 'announcements', a.id) : doc(collection(db, 'announcements'))
  const { id: _id, ...data } = a
  await setDoc(ref, { ...data, at: serverTimestamp() })
  await audit(me, 'announcement', `${a.id ? 'Updated' : 'Posted'} “${a.title}”${a.active ? '' : ' (off)'}`)
}
export async function deleteAnnouncement(a: Announcement, me: Actor) {
  await deleteDoc(doc(db, 'announcements', a.id))
  await audit(me, 'announcement', `Deleted “${a.title}”`)
}

// ---------- settings ----------

export interface PlatformSettings {
  companyName: string
  regNo: string
  address: string
  email: string
  phone: string
  sstNo: string
  taxRate: number
  invoicePrefix: string
  paymentInfo: string
  currency: 'MYR' | 'USD'
}
export const DEFAULT_SETTINGS: PlatformSettings = { companyName: 'Attend', regNo: '', address: '', email: '', phone: '', sstNo: '', taxRate: 0, invoicePrefix: 'INV', paymentInfo: '', currency: 'MYR' }
export function subscribeSettings(onData: (s: PlatformSettings) => void, onError: (e: Error) => void) {
  return onSnapshot(doc(db, 'platformConfig', 'settings'), (snap) => onData({ ...DEFAULT_SETTINGS, ...(snap.exists() ? (snap.data() as Partial<PlatformSettings>) : {}) }), onError)
}
export async function saveSettings(settings: PlatformSettings, me: Actor) {
  await setDoc(doc(db, 'platformConfig', 'settings'), settings)
  await audit(me, 'settings', 'Company and invoice settings saved')
}

export { Timestamp }
