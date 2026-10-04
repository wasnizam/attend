import { collection, doc, onSnapshot, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { AttendanceRecord, UserProfile } from '../lib/types'

/**
 * Each person's registered phone (phones/{org}_{staffKey}) and, the other way round, whose
 * phone each label is (devices/{org}_{label}). Written together: by a person's first clock-in,
 * or by a manager approving a new phone.
 */
export interface Phones {
  byStaff: Map<string, string>
  byDevice: Map<string, string>
}

export function subscribePhones(organisationId: string, onData: (phones: Phones) => void, onError: (e: Error) => void) {
  const byStaff = new Map<string, string>()
  const byDevice = new Map<string, string>()
  let ready = 0 // 2 once the device half has arrived
  // Sent once both halves have arrived.
  let gotStaff = false
  const send = () => ready === 2 && gotStaff && onData({ byStaff: new Map(byStaff), byDevice: new Map(byDevice) })
  const a = onSnapshot(
    query(collection(db, 'phones'), where('organisationId', '==', organisationId)),
    (snap) => {
      byStaff.clear()
      snap.forEach((d) => byStaff.set(d.data().staffKey, d.data().device))
      gotStaff = true
      send()
    },
    onError,
  )
  const b = onSnapshot(
    query(collection(db, 'devices'), where('organisationId', '==', organisationId)),
    (snap) => {
      byDevice.clear()
      snap.forEach((d) => byDevice.set(d.data().device, d.data().staffKey))
      ready = 2
      send()
    },
    onError,
  )
  return () => {
    a()
    b()
  }
}

/** A manager confirms that this phone now belongs to this person (a new phone, or a shared one fixed). */
export async function approvePhone(organisationId: string, staffKey: string, device: string, viewer: UserProfile, previous?: string) {
  const batch = writeBatch(db)
  const body = { organisationId, staffKey, device, sessionId: '', by: viewer.id, at: serverTimestamp() }
  batch.set(doc(db, 'phones', `${organisationId}_${staffKey}`), body)
  batch.set(doc(db, 'devices', `${organisationId}_${device}`), body)
  // Their old phone is no longer theirs (only passed when that record exists: deleting a missing
  // one would be refused and take the whole change with it).
  if (previous && previous !== device) batch.delete(doc(db, 'devices', `${organisationId}_${previous}`))
  await batch.commit()
}

/** Forget a person's phone: their next clock-in registers whatever phone they use. */
export async function resetPhone(organisationId: string, staffKey: string, phones: Phones) {
  const batch = writeBatch(db)
  batch.delete(doc(db, 'phones', `${organisationId}_${staffKey}`))
  const device = phones.byStaff.get(staffKey)
  if (device && phones.byDevice.get(device) === staffKey) batch.delete(doc(db, 'devices', `${organisationId}_${device}`))
  await batch.commit()
}

export type PhoneNote = { kind: 'ok' } | { kind: 'unknown'; registered: string } | { kind: 'other'; owner: string } | { kind: 'none' }

/** How a check-in's phone compares with what is registered. */
export function phoneNote(staffKey: string, device: string | undefined, phones: Phones): PhoneNote {
  // No label: a check-in from before phones were registered (or a browser that keeps nothing).
  // Flagging every old record would bury the real ones; "Refuse" mode turns these away anyway.
  if (!device) return { kind: 'ok' }
  const owner = phones.byDevice.get(device)
  if (owner && owner !== staffKey) return { kind: 'other', owner }
  const registered = phones.byStaff.get(staffKey)
  if (registered && registered !== device) return { kind: 'unknown', registered }
  return { kind: 'ok' }
}

/** A phone flag on one check-in, worked out the same way everywhere a manager looks. */
export type PhoneFlag =
  | { kind: 'other'; owner: string }
  | { kind: 'unknown'; registered: string }
  | { kind: 'none' }
  | { kind: 'shared'; with: string[] }

/** Flags for a set of check-ins. Records a manager already cleared, and hand-added ones, are left out. */
export function phoneFlags(records: AttendanceRecord[], phones: Phones): Map<string, PhoneFlag> {
  const flags = new Map<string, PhoneFlag>()
  for (const r of records) {
    if (r.method === 'manual' || r.phoneChecked) continue
    const p = phoneNote(r.studentKey, r.device, phones)
    if (p.kind !== 'ok') flags.set(r.id, p)
  }
  // One unregistered phone used by several people on the same day.
  const groups = new Map<string, AttendanceRecord[]>()
  for (const r of records) if (r.device && !phones.byDevice.has(r.device)) groups.set(`${r.sessionId}|${r.device}`, [...(groups.get(`${r.sessionId}|${r.device}`) ?? []), r])
  for (const group of groups.values()) {
    if (group.length < 2) continue
    for (const r of group) if (!r.phoneChecked && !flags.has(r.id)) flags.set(r.id, { kind: 'shared', with: group.filter((x) => x.id !== r.id).map((x) => x.studentName) })
  }
  return flags
}
