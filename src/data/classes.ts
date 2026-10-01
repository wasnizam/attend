import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { classSessionId, meetingKey } from '../lib/format'
import type { Delivery, Session, Slot, UserProfile, WeeklyClass } from '../lib/types'
import { newSessionData, startSession } from './sessions'

export interface ClassInput {
  name: string
  description: string
  slots: Slot[]
  startDate: string | null
  endDate: string | null
  expected: number | null
  code: string
  section: string
  venue: string
  delivery: Delivery
  meetingUrl: string
}

const classes = collection(db, 'classes')

const clean = (input: ClassInput) => ({
  name: input.name.trim(),
  description: input.description.trim(),
  slots: input.slots,
  // Kept alongside slots so "which days" stays a simple field to read and query.
  days: [...new Set(input.slots.map((s) => s.day))].sort(),
  startTime: input.slots[0].startTime,
  endTime: input.slots[0].endTime,
  startDate: input.startDate,
  endDate: input.endDate,
  expected: input.expected,
  code: input.code.trim(),
  section: input.section.trim(),
  venue: input.venue.trim(),
  delivery: input.delivery,
  meetingUrl: input.meetingUrl.trim(),
})

export async function createClass(profile: UserProfile, input: ClassInput): Promise<string> {
  const ref = await addDoc(classes, {
    organisationId: profile.organisationId,
    ownerId: profile.id,
    ownerName: profile.name,
    ...clean(input),
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export const updateClass = (id: string, input: ClassInput) => updateDoc(doc(classes, id), clean(input))

/** The report's warning and barring levels, as percentages of the semester's classes. */
export const setThresholds = (id: string, warnPct: number, barPct: number) =>
  updateDoc(doc(classes, id), { warnPct, barPct })

/** Calls off one meeting of a class (it will not count towards the semester total), or puts it back. */
export const cancelMeeting = (cls: WeeklyClass, date: string, slot: Slot, reason: string) =>
  updateDoc(doc(classes, cls.id), { [`cancelled.${meetingKey(date, slot)}`]: reason.trim() || '-' })

export const restoreMeeting = (cls: WeeklyClass, date: string, slot: Slot) =>
  updateDoc(doc(classes, cls.id), { [`cancelled.${meetingKey(date, slot)}`]: deleteField() })

/** Removes the class from the timetable. Sessions already held keep their records. */
export const deleteClass = (id: string) => deleteDoc(doc(classes, id))

export function subscribeMyClasses(
  profile: UserProfile,
  onData: (classes: WeeklyClass[]) => void,
  onError: (e: Error) => void,
) {
  return onSnapshot(
    query(classes, where('organisationId', '==', profile.organisationId), where('ownerId', '==', profile.id)),
    (snap) =>
      onData(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as WeeklyClass)
          .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.name.localeCompare(b.name)),
      ),
    onError,
  )
}

/**
 * Turns one meeting of a timetable class into today's real session and opens attendance.
 * Returns the session ID.
 */
export async function startClassSession(
  profile: UserProfile,
  cls: WeeklyClass,
  date: string,
  slot: Slot,
  rotating = false,
): Promise<string> {
  const ref = doc(db, 'sessions', classSessionId(cls.id, date, slot))
  try {
    const listed = cls.rosterCount && cls.rosterCount > 0
    await setDoc(
      ref,
      newSessionData(
        profile,
        {
          name: cls.name,
          description: cls.description,
          date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          rosterId: listed ? cls.id : null,
          expected: listed ? cls.rosterCount! : cls.expected,
          code: cls.code,
          section: cls.section,
          venue: cls.venue,
          delivery: cls.delivery,
          meetingUrl: cls.meetingUrl,
          geofence: cls,
        },
        cls.id,
      ),
    )
  } catch (e) {
    // Denied means the session already exists (created from another device); carry on with it.
    if ((e as { code?: string }).code !== 'permission-denied') throw e
  }
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Could not start this class. Please try again.')
  const session = { id: snap.id, ...snap.data() } as Session
  if (session.status === 'scheduled') await startSession(session, rotating)
  return session.id
}

export { classSessionId }
