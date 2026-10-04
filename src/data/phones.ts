import { collection, doc, onSnapshot, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { UserProfile } from '../lib/types'

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

export type PhoneNote = { kind: 'ok' } | { kind: 'unknown'; registered: string } | { kind: 'other'; owner: string } | { kind: 'none' }

/** How a check-in's phone compares with what is registered. */
export function phoneNote(staffKey: string, device: string | undefined, phones: Phones): PhoneNote {
  if (!device) return { kind: 'none' }
  const owner = phones.byDevice.get(device)
  if (owner && owner !== staffKey) return { kind: 'other', owner }
  const registered = phones.byStaff.get(staffKey)
  if (registered && registered !== device) return { kind: 'unknown', registered }
  return { kind: 'ok' }
}
