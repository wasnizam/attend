import {
  GeoPoint,
  type QueryConstraint,
  writeBatch,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { studentKey } from '../lib/format'
import type { Position } from '../lib/geo'
import type { AttendanceRecord, AttendanceStatus, Session, SessionLink, UserProfile } from '../lib/types'

const attendance = collection(db, 'attendance')
const toRecord = (id: string, data: object) => ({ id, ...data }) as AttendanceRecord

export type SubmitResult =
  | { kind: 'recorded'; studentName: string; time: Date }
  | { kind: 'duplicate'; studentName: string; time: Date | null }
  | { kind: 'closed' }
  /** The session is open, but the scanned QR is too old (rotating QR). Scan again. */
  | { kind: 'stale' }

/**
 * Records one participant for one session. The document ID is
 * `{sessionId}_{studentKey}`, and the security rules only allow *creating* it, so a
 * second submission for the same ID can never produce a second record.
 */
export async function submitAttendance(
  link: SessionLink,
  rawStudentId: string,
  rawName: string,
  /** The rotating-QR code carried by the scanned link, if any. */
  code?: string,
  /** Where the phone is, when the session checks location and the student allowed it. */
  position?: Position,
): Promise<SubmitResult> {
  const key = studentKey(rawStudentId)
  const ref = doc(attendance, `${link.sessionId}_${key}`)

  const duplicate = async (): Promise<SubmitResult | null> => {
    const snap = await getDoc(ref)
    if (!snap.exists()) return null
    const existing = toRecord(snap.id, snap.data())
    return { kind: 'duplicate', studentName: existing.studentName, time: existing.timestamp?.toDate() ?? null }
  }

  const existing = await duplicate()
  if (existing) return existing

  try {
    const record = {
      sessionId: link.sessionId,
      organisationId: link.organisationId,
      ownerId: link.ownerId,
      sessionName: link.name,
      date: link.date,
      token: link.token,
      studentKey: key,
      studentId: rawStudentId.trim().toUpperCase(),
      studentName: rawName.trim(),
      timestamp: serverTimestamp(),
      status: 'present',
      method: 'qr',
      ...(code ? { code } : {}),
    }
    if (position) {
      // One atomic write: the rules read the location while deciding on the record.
      const batch = writeBatch(db)
      batch.set(doc(db, 'locations', ref.id), {
        sessionId: link.sessionId,
        organisationId: link.organisationId,
        ownerId: link.ownerId,
        studentKey: key,
        point: new GeoPoint(position.lat, position.lng),
        accuracy: position.accuracy,
        timestamp: serverTimestamp(),
      })
      batch.set(ref, record)
      await batch.commit()
    } else {
      await setDoc(ref, record)
    }
    return { kind: 'recorded', studentName: rawName.trim(), time: new Date() }
  } catch (e) {
    if ((e as { code?: string }).code !== 'permission-denied') throw e
    // Denied: someone recorded this ID a moment ago, the session just closed, or the
    // QR that was scanned has rotated away.
    const again = await duplicate()
    if (again) return again
    const fresh = await getDoc(doc(db, 'sessionLinks', link.token))
    const open = fresh.exists() && fresh.data().status === 'active' && fresh.data().expiresAt.toMillis() > Date.now()
    return open ? { kind: 'stale' } : { kind: 'closed' }
  }
}

function sessionQuery(session: Pick<Session, 'id' | 'organisationId'>, viewer: UserProfile) {
  const constraints: QueryConstraint[] = [
    where('organisationId', '==', session.organisationId),
    where('sessionId', '==', session.id),
  ]
  // Lecturers may only query their own records; the rules require the filter to say so.
  if (viewer.role !== 'admin') constraints.push(where('ownerId', '==', viewer.id))
  return query(attendance, ...constraints)
}

/** One-off read of a session's records, for reports. */
export async function fetchSessionAttendance(
  session: Pick<Session, 'id' | 'organisationId'>,
  viewer: UserProfile,
): Promise<AttendanceRecord[]> {
  const snap = await getDocs(sessionQuery(session, viewer))
  return snap.docs.map((d) => toRecord(d.id, d.data()))
}

/**
 * The lecturer records someone by hand: a student whose phone is dead, or an excused
 * absence. Works while the session is running and after it has ended.
 */
export async function markManually(
  session: Session,
  viewer: UserProfile,
  student: { studentId: string; studentName: string },
  status: AttendanceStatus,
): Promise<void> {
  const key = studentKey(student.studentId)
  await setDoc(doc(attendance, `${session.id}_${key}`), {
    sessionId: session.id,
    organisationId: session.organisationId,
    ownerId: session.ownerId,
    sessionName: session.name,
    date: session.date,
    studentKey: key,
    studentId: student.studentId.trim().toUpperCase(),
    studentName: student.studentName.trim(),
    timestamp: serverTimestamp(),
    status,
    method: 'manual',
    markedBy: viewer.id,
  })
}

export const setAttendanceStatus = (id: string, status: AttendanceStatus) =>
  updateDoc(doc(attendance, id), { status })

/** Live list of who has checked in to a session, earliest first. */
export function subscribeSessionAttendance(
  session: Pick<Session, 'id' | 'organisationId'>,
  viewer: UserProfile,
  onData: (records: AttendanceRecord[]) => void,
  onError: (e: Error) => void,
) {
  return onSnapshot(
    sessionQuery(session, viewer),
    (snap) =>
      onData(
        snap.docs
          .map((d) => toRecord(d.id, d.data()))
          .sort((a, b) => (a.timestamp?.toMillis() ?? 0) - (b.timestamp?.toMillis() ?? 0)),
      ),
    onError,
  )
}

/** Admin: every attendance record in the organisation within a date range. */
export function subscribeOrgAttendance(
  organisationId: string,
  from: string,
  to: string,
  onData: (records: AttendanceRecord[]) => void,
  onError: (e: Error) => void,
) {
  return onSnapshot(
    query(
      attendance,
      where('organisationId', '==', organisationId),
      where('date', '>=', from),
      where('date', '<=', to),
      orderBy('date', 'desc'),
      limit(5000),
    ),
    (snap) =>
      onData(
        snap.docs
          .map((d) => toRecord(d.id, d.data()))
          .sort(
            (a, b) =>
              b.date.localeCompare(a.date) || (b.timestamp?.toMillis() ?? 0) - (a.timestamp?.toMillis() ?? 0),
          ),
      ),
    onError,
  )
}

export const removeAttendance = (id: string) => deleteDoc(doc(attendance, id))

// ---- presence checks ("still here?") ----

const checkins = collection(db, 'checkins')

/** Participant side: confirm presence for the open check. Safe to call twice. */
export async function confirmPresence(link: SessionLink, rawStudentId: string): Promise<void> {
  if (!link.checkpoint) return
  const key = studentKey(rawStudentId)
  try {
    await setDoc(doc(checkins, `${link.sessionId}_${link.checkpoint.n}_${key}`), {
      sessionId: link.sessionId,
      organisationId: link.organisationId,
      ownerId: link.ownerId,
      n: link.checkpoint.n,
      studentKey: key,
      token: link.token,
      timestamp: serverTimestamp(),
    })
  } catch (e) {
    // A second confirmation is an update, which the rules refuse. If the check is still
    // open, that refusal means "already confirmed"; if it has closed, it is too late.
    if ((e as { code?: string }).code !== 'permission-denied' || link.checkpoint.expiresAt.toMillis() <= Date.now()) throw e
  }
}

/** Lecturer side: who confirmed each check. Map of check number -> student keys. */
export function subscribeCheckins(
  session: Pick<Session, 'id' | 'organisationId'>,
  viewer: UserProfile,
  onData: (byCheck: Map<number, Set<string>>) => void,
  onError: (e: Error) => void,
) {
  const constraints: QueryConstraint[] = [
    where('organisationId', '==', session.organisationId),
    where('sessionId', '==', session.id),
  ]
  if (viewer.role !== 'admin') constraints.push(where('ownerId', '==', viewer.id))
  return onSnapshot(
    query(checkins, ...constraints),
    (snap) => {
      const byCheck = new Map<number, Set<string>>()
      for (const d of snap.docs) {
        const { n, studentKey: key } = d.data() as { n: number; studentKey: string }
        byCheck.set(n, (byCheck.get(n) ?? new Set()).add(key))
      }
      onData(byCheck)
    },
    onError,
  )
}

// ---- locations shared at check-in ----

/** Lecturer side: where each student was when they checked in. Map of student key -> position. */
export function subscribeLocations(
  session: Pick<Session, 'id' | 'organisationId'>,
  viewer: UserProfile,
  onData: (byStudent: Map<string, Position>) => void,
  onError: (e: Error) => void,
) {
  const constraints: QueryConstraint[] = [
    where('organisationId', '==', session.organisationId),
    where('sessionId', '==', session.id),
  ]
  if (viewer.role !== 'admin') constraints.push(where('ownerId', '==', viewer.id))
  return onSnapshot(
    query(collection(db, 'locations'), ...constraints),
    (snap) => {
      const byStudent = new Map<string, Position>()
      for (const d of snap.docs) {
        const { studentKey: key, point, accuracy } = d.data() as { studentKey: string; point: GeoPoint; accuracy: number }
        byStudent.set(key, { lat: point.latitude, lng: point.longitude, accuracy })
      }
      onData(byStudent)
    },
    onError,
  )
}

/** Participant side: when (if ever) this person checked in to the session. */
export async function getCheckIn(link: SessionLink, rawStudentId: string): Promise<Date | null> {
  const snap = await getDoc(doc(attendance, `${link.sessionId}_${studentKey(rawStudentId)}`))
  return snap.exists() ? (toRecord(snap.id, snap.data()).timestamp?.toDate() ?? new Date()) : null
}

// ---- clock-out (workplace) ----

const clockouts = collection(db, 'clockouts')

/** Participant side: when (if ever) this person clocked out of the session. */
export async function getClockOut(link: SessionLink, rawStudentId: string): Promise<Date | null> {
  const snap = await getDoc(doc(clockouts, `${link.sessionId}_${studentKey(rawStudentId)}`))
  return snap.exists() ? ((snap.data().timestamp as { toDate(): Date } | null)?.toDate() ?? new Date()) : null
}

/** Participant side: clock out now. Returns the time recorded. */
export async function clockOut(link: SessionLink, rawStudentId: string, code?: string): Promise<Date> {
  const key = studentKey(rawStudentId)
  const ref = doc(clockouts, `${link.sessionId}_${key}`)
  try {
    await setDoc(ref, {
      sessionId: link.sessionId,
      organisationId: link.organisationId,
      ownerId: link.ownerId,
      studentKey: key,
      token: link.token,
      by: 'self',
      ...(code ? { code } : {}),
      timestamp: serverTimestamp(),
    })
    return new Date()
  } catch (e) {
    // A second clock-out is refused; show the first one instead of an error.
    const existing = await getClockOut(link, rawStudentId)
    if (existing) return existing
    throw e
  }
}

/** Manager side: clock someone out now (they forgot, or their phone is dead). */
export const clockOutFor = (session: Session, viewer: UserProfile, key: string) =>
  setDoc(doc(clockouts, `${session.id}_${key}`), {
    sessionId: session.id,
    organisationId: session.organisationId,
    ownerId: session.ownerId,
    studentKey: key,
    by: viewer.id,
    timestamp: serverTimestamp(),
  })

export const undoClockOut = (session: Pick<Session, 'id'>, key: string) => deleteDoc(doc(clockouts, `${session.id}_${key}`))

function clockoutQuery(session: Pick<Session, 'id' | 'organisationId'>, viewer: UserProfile) {
  const constraints: QueryConstraint[] = [
    where('organisationId', '==', session.organisationId),
    where('sessionId', '==', session.id),
  ]
  if (viewer.role !== 'admin') constraints.push(where('ownerId', '==', viewer.id))
  return query(clockouts, ...constraints)
}

type ClockOuts = Map<string, { toMillis(): number; toDate(): Date }>
const toClockOuts = (docs: { data(): object }[]): ClockOuts =>
  new Map(
    docs
      .map((d) => d.data() as { studentKey: string; timestamp: { toMillis(): number; toDate(): Date } | null })
      .filter((d) => d.timestamp)
      .map((d) => [d.studentKey, d.timestamp!]),
  )

/** Manager side: clock-out times for a session, by student key, live. */
export function subscribeClockOuts(
  session: Pick<Session, 'id' | 'organisationId'>,
  viewer: UserProfile,
  onData: (outs: ClockOuts) => void,
  onError: (e: Error) => void,
) {
  return onSnapshot(clockoutQuery(session, viewer), (snap) => onData(toClockOuts(snap.docs)), onError)
}

/** One-off read, for reports. */
export async function fetchClockOuts(session: Pick<Session, 'id' | 'organisationId'>, viewer: UserProfile): Promise<ClockOuts> {
  return toClockOuts((await getDocs(clockoutQuery(session, viewer))).docs)
}

export type { ClockOuts }
