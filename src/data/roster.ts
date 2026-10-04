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
  // The rules allow whoever manages the class now (or an admin) to read its list.
  void viewer
  return onSnapshot(
    query(students(rosterId), where('organisationId', '==', organisationId)),
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
  void viewer
  const snap = await getDocs(query(students(rosterId), where('organisationId', '==', organisationId)))
  return snap.docs.map((d) => d.data() as RosterEntry)
}

const BATCH = 400

/** Everyone on this owner's other lists, by key. Only read when the plan has a limit on people. */
async function staffElsewhere(cls: WeeklyClass): Promise<Set<string>> {
  const mine = [where('organisationId', '==', cls.organisationId), where('ownerId', '==', cls.ownerId)]
  const lists = await getDocs(query(collection(db, 'classes'), ...mine))
  const keys = new Set<string>()
  await Promise.all(
    lists.docs
      .filter((d) => d.id !== cls.id)
      .map(async (d) => (await getDocs(query(students(d.id), where('organisationId', '==', cls.organisationId)))).forEach((s) => keys.add(s.id))),
  )
  return keys
}

/** Adds or updates students on a class list and keeps the class's headcount in step. */
export async function addToRoster(cls: WeeklyClass, entries: RosterEntry[], existing: RosterEntry[]) {
  const known = new Set(existing.map((e) => e.studentKey))
  const added = entries.filter((e) => !known.has(e.studentKey)).length
  if (added > 0 && limitFor('staff') !== undefined) {
    // The plan counts people across all of this manager's lists, each person once.
    const everyone = await staffElsewhere(cls)
    for (const e of [...existing, ...entries]) everyone.add(e.studentKey)
    if (overLimit('staff', everyone.size)) throw new Error(t('Your plan includes up to {n} staff. Upgrade to add more.', { n: limitFor('staff') ?? 0 }))
  }
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
  await syncOpenDays(cls, existing.length + added).catch(() => {})
}

/**
 * Keeps a day that is already open in step with its list: a day opened before the list existed
 * starts using it, and the number expected follows people being added or removed.
 */
async function syncOpenDays(cls: WeeklyClass, count: number) {
  const open = await getDocs(
    query(collection(db, 'sessions'), where('organisationId', '==', cls.organisationId), where('ownerId', '==', cls.ownerId), where('classId', '==', cls.id), where('status', '==', 'active')),
  )
  const batch = writeBatch(db)
  let any = false
  open.forEach((d) => {
    const s = d.data()
    if (!s.token || (s.rosterId && s.rosterId !== cls.id)) return
    any = true
    batch.update(d.ref, { rosterId: cls.id, expected: count })
    if (!s.rosterId) batch.update(doc(db, 'sessionLinks', s.token), { rosterId: cls.id })
  })
  if (any) await batch.commit()
}

export async function removeFromRoster(cls: WeeklyClass, keys: string[]) {
  for (let i = 0; i < keys.length; i += BATCH) {
    const batch = writeBatch(db)
    for (const key of keys.slice(i, i + BATCH)) batch.delete(doc(students(cls.id), key))
    await batch.commit()
  }
  await setCount(cls.id, -keys.length)
  await syncOpenDays(cls, Math.max(0, (cls.rosterCount ?? keys.length) - keys.length)).catch(() => {})
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
