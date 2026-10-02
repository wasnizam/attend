import { t } from '../lib/i18n'
import { limitFor, overLimit } from '../lib/plan'
import { collection, doc, getDoc, getDocs, increment, onSnapshot, query, where, writeBatch } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { studentKey } from '../lib/format'
import type { RosterEntry } from '../lib/rosterImport'
import type { UserProfile, WeeklyClass } from '../lib/types'

// A class's student list lives at rosters/{classId}/students/{studentKey}.
const students = (rosterId: string) => collection(db, 'rosters', rosterId, 'students')

/** The whole list, sorted by name. Lecturer / admin only. */
export function subscribeRoster(
  rosterId: string,
  organisationId: string,
  viewer: UserProfile,
  onData: (roster: RosterEntry[]) => void,
  onError: (e: Error) => void,
) {
  const constraints = [where('organisationId', '==', organisationId)]
  if (viewer.role !== 'admin') constraints.push(where('ownerId', '==', viewer.id))
  return onSnapshot(
    query(students(rosterId), ...constraints),
    (snap) =>
      onData(
        snap.docs
          .map((d) => d.data() as RosterEntry)
          .sort((a, b) => a.studentName.localeCompare(b.studentName)),
      ),
    onError,
  )
}

/** One-off read of a class list, for reports that cover several classes at once. */
export async function fetchRoster(rosterId: string, organisationId: string, viewer: UserProfile): Promise<RosterEntry[]> {
  const constraints = [where('organisationId', '==', organisationId)]
  if (viewer.role !== 'admin') constraints.push(where('ownerId', '==', viewer.id))
  const snap = await getDocs(query(students(rosterId), ...constraints))
  return snap.docs.map((d) => d.data() as RosterEntry)
}

const BATCH = 400

/** Adds or updates students on a class list and keeps the class's headcount in step. */
export async function addToRoster(cls: WeeklyClass, entries: RosterEntry[], existing: RosterEntry[]) {
  const known = new Set(existing.map((e) => e.studentKey))
  const added = entries.filter((e) => !known.has(e.studentKey)).length
  if (added > 0 && overLimit('staff', existing.length + added)) throw new Error(t('Your plan includes up to {n} staff. Upgrade to add more.', { n: limitFor('staff') ?? 0 }))
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = writeBatch(db)
    for (const e of entries.slice(i, i + BATCH)) {
      batch.set(doc(students(cls.id), e.studentKey), {
        ...e,
        organisationId: cls.organisationId,
        ownerId: cls.ownerId,
      })
    }
    await batch.commit()
  }
  await setCount(cls.id, added)
}

export async function removeFromRoster(cls: WeeklyClass, keys: string[]) {
  for (let i = 0; i < keys.length; i += BATCH) {
    const batch = writeBatch(db)
    for (const key of keys.slice(i, i + BATCH)) batch.delete(doc(students(cls.id), key))
    await batch.commit()
  }
  await setCount(cls.id, -keys.length)
}

async function setCount(classId: string, delta: number) {
  if (delta === 0) return
  const batch = writeBatch(db)
  batch.update(doc(db, 'classes', classId), { rosterCount: increment(delta) })
  await batch.commit()
}

/** Participant side: look one ID up on the list. Returns the official name, or null. */
export async function lookupStudent(rosterId: string, rawStudentId: string): Promise<string | null> {
  const key = studentKey(rawStudentId)
  if (!key) return null
  const snap = await getDoc(doc(students(rosterId), key))
  return snap.exists() ? (snap.data() as RosterEntry).studentName : null
}
