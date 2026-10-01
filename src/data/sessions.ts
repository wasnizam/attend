import {
  GeoPoint,
  Timestamp,
  addDoc,
  getDocs,
  updateDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { isAway, parseDate, randomToken } from '../lib/format'
import type { Delivery, GeoMode, Geofence, Session, SessionLink, UserProfile } from '../lib/types'

export interface NewSession {
  name: string
  description: string
  date: string
  startTime: string
  endTime: string
  expected: number | null
  /** Class whose student list should be used, if any. */
  rosterId?: string | null
  code?: string
  section?: string
  venue?: string
  delivery?: Delivery
  meetingUrl?: string
  /** Location check carried over from the class, if it has one. */
  geofence?: Geofence
}

const sessions = collection(db, 'sessions')
const toSession = (id: string, data: object) => ({ id, ...data }) as Session

/** The document body for a brand-new, not-yet-started session. */
export function newSessionData(profile: UserProfile, input: NewSession, classId: string | null = null) {
  return {
    organisationId: profile.organisationId,
    ownerId: profile.id,
    ownerName: profile.name,
    name: input.name.trim(),
    description: input.description.trim(),
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    expected: input.expected,
    code: (input.code ?? '').trim(),
    section: (input.section ?? '').trim(),
    venue: (input.venue ?? '').trim(),
    delivery: input.delivery ?? 'in_person',
    meetingUrl: (input.meetingUrl ?? '').trim(),
    geoPoint: input.geofence?.geoPoint ?? null,
    geoRadius: input.geofence?.geoRadius ?? null,
    geoCos: input.geofence?.geoCos ?? null,
    geoMode: input.geofence?.geoPoint ? (input.geofence.geoMode ?? null) : null,
    mode: 'qr',
    classId,
    rosterId: input.rosterId ?? null,
    status: 'scheduled',
    token: null,
    presentCount: 0,
    createdAt: serverTimestamp(),
    startedAt: null,
    endedAt: null,
    expiresAt: null,
  }
}

export async function createSession(profile: UserProfile, input: NewSession): Promise<string> {
  const ref = await addDoc(sessions, newSessionData(profile, input))
  return ref.id
}

/** A lecturer's own sessions, newest first. */
export function subscribeMySessions(
  profile: UserProfile,
  onData: (sessions: Session[]) => void,
  onError: (e: Error) => void,
) {
  return onSnapshot(
    query(
      sessions,
      // Equality filters only: this needs no composite index, so a fresh project works
      // the moment its rules are published. Sorted here instead of by the database.
      where('organisationId', '==', profile.organisationId),
      where('ownerId', '==', profile.id),
    ),
    (snap) =>
      onData(
        snap.docs
          .map((d) => toSession(d.id, d.data()))
          .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime)),
      ),
    onError,
  )
}

/** Admin: every session in the organisation within a date range. */
export function subscribeOrgSessions(
  organisationId: string,
  from: string,
  to: string,
  onData: (sessions: Session[]) => void,
  onError: (e: Error) => void,
) {
  return onSnapshot(
    query(
      sessions,
      where('organisationId', '==', organisationId),
      where('date', '>=', from),
      where('date', '<=', to),
      orderBy('date', 'desc'),
      limit(1000),
    ),
    (snap) => onData(snap.docs.map((d) => toSession(d.id, d.data()))),
    onError,
  )
}

export function subscribeSession(
  id: string,
  onData: (session: Session | null) => void,
  onError: (e: Error) => void,
) {
  return onSnapshot(
    doc(db, 'sessions', id),
    (snap) => onData(snap.exists() ? toSession(snap.id, snap.data()) : null),
    onError,
  )
}

const MIN_OPEN_MS = 30 * 60 * 1000

/** When the QR stops working: the scheduled end, but never less than 30 minutes from now. */
function expiryFor(session: Session): Date {
  const start = parseDate(session.date, session.startTime)
  const end = parseDate(session.date, session.endTime)
  if (end <= start) end.setDate(end.getDate() + 1)
  return new Date(Math.max(end.getTime(), Date.now() + MIN_OPEN_MS))
}

const newCode = () => randomToken(5)

/**
 * Opens attendance: issues a fresh token, publishes the public link document the QR
 * points at, and flips the session to active — atomically. Also used to reopen an ended
 * session: it gets a new token, so the QR that was closed stays dead.
 */
export async function startSession(session: Session, rotatingPref = false): Promise<void> {
  // Online and hybrid sessions always use the code: there is no room to be standing in.
  const rotating = rotatingPref || isRemote(session)
  const expiresAt = Timestamp.fromDate(expiryFor(session))
  let lastError: unknown
  // A token collision is rejected by the rules (links cannot be overwritten), so retry.
  for (let attempt = 0; attempt < 4; attempt++) {
    const token = randomToken()
    const batch = writeBatch(db)
    batch.set(doc(db, 'sessionLinks', token), {
      sessionId: session.id,
      organisationId: session.organisationId,
      ownerId: session.ownerId,
      name: session.name,
      date: session.date,
      startTime: session.startTime,
      endTime: session.endTime,
      venue: session.venue ?? '',
      status: 'active',
      expiresAt,
      rosterId: session.rosterId ?? null,
      needsCode: rotating,
      checkpoint: null,
      geo: session.geoPoint ? (session.geoMode ?? null) : null,
    })
    batch.update(doc(db, 'sessions', session.id), {
      status: 'active',
      token,
      ...(session.startedAt ? {} : { startedAt: serverTimestamp() }),
      endedAt: null,
      expiresAt,
      qrCode: rotating ? newCode() : null,
      qrCodePrev: null,
      checkpoint: null,
    })
    try {
      await batch.commit()
      return
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}

export const isRemote = (s: { delivery?: Delivery }) => s.delivery === 'online' || s.delivery === 'hybrid'

/** Turns the rotating code on or off for a running session. */
export async function setRotating(session: Session, on: boolean) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'sessions', session.id), { qrCode: on ? newCode() : null, qrCodePrev: null })
  if (session.token) batch.update(doc(db, 'sessionLinks', session.token), { needsCode: on })
  await batch.commit()
}

/**
 * Turns the location check on (with where the class is, how far counts, and what to do
 * about it) or off. The setting is remembered on the class for its next sessions.
 */
export async function setGeofence(
  session: Session,
  fence: { lat: number; lng: number; radius: number; mode: GeoMode } | null,
) {
  const fields = fence
    ? {
        geoPoint: new GeoPoint(fence.lat, fence.lng),
        geoRadius: fence.radius,
        geoMode: fence.mode,
        geoCos: Math.cos((fence.lat * Math.PI) / 180),
      }
    : { geoPoint: null, geoRadius: null, geoMode: null, geoCos: null }
  const batch = writeBatch(db)
  batch.update(doc(db, 'sessions', session.id), fields)
  if (session.token) batch.update(doc(db, 'sessionLinks', session.token), { geo: fence?.mode ?? null })
  await batch.commit()
  // Best effort: the session itself is already set.
  if (session.classId) await updateDoc(doc(db, 'classes', session.classId), fields).catch(() => {})
}

export const CHECKPOINT_MS = 3 * 60 * 1000

/** Opens a "still here?" check for three minutes. Students who checked in are asked to confirm. */
export async function startCheckpoint(session: Session) {
  const n = (session.checkpointCount ?? 0) + 1
  const closes = Date.now() + CHECKPOINT_MS
  const checkpoint = { n, expiresAt: Timestamp.fromMillis(closes) }
  const batch = writeBatch(db)
  batch.update(doc(db, 'sessions', session.id), {
    checkpoint,
    checkpointCount: n,
    checkpointTimes: [...(session.checkpointTimes ?? []), closes],
  })
  if (session.token) batch.update(doc(db, 'sessionLinks', session.token), { checkpoint })
  await batch.commit()
}

/** Participant side: follow the link live, to hear about a presence check as it opens. */
export function subscribeSessionLink(token: string, onData: (link: SessionLink | null) => void) {
  return onSnapshot(
    doc(db, 'sessionLinks', token),
    (snap) => onData(snap.exists() ? ({ token: snap.id, ...snap.data() } as SessionLink) : null),
    () => {},
  )
}

/** Moves the rotating QR to its next code. The previous one stays valid for one more turn. */
export const rotateCode = (session: Session) =>
  updateDoc(doc(db, 'sessions', session.id), { qrCode: newCode(), qrCodePrev: session.qrCode ?? null })

/** Closes attendance. The token is dead from this point on. */
export async function endSession(session: Session): Promise<void> {
  const snap = await getDocs(
    query(
      collection(db, 'attendance'),
      where('organisationId', '==', session.organisationId),
      where('ownerId', '==', session.ownerId),
      where('sessionId', '==', session.id),
    ),
  )
  // Excused students are on record but were not in the room.
  const present = snap.docs.filter((d) => !isAway(d.data().status)).length
  const batch = writeBatch(db)
  batch.update(doc(db, 'sessions', session.id), {
    status: 'ended',
    endedAt: serverTimestamp(),
    presentCount: present,
    qrCode: null,
    qrCodePrev: null,
  })
  if (session.token) batch.update(doc(db, 'sessionLinks', session.token), { status: 'ended' })
  await batch.commit()
}

/** Keeps the stored headcount right after records are added or changed on an ended session. */
export const setPresentCount = (sessionId: string, presentCount: number) =>
  updateDoc(doc(db, 'sessions', sessionId), { presentCount })

export const deleteSession = (id: string) => deleteDoc(doc(db, 'sessions', id))

/** Participant side: resolve a scanned token. */
export async function getSessionLink(token: string): Promise<SessionLink | null> {
  const clean = token.trim().toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(clean)) return null
  const snap = await getDoc(doc(db, 'sessionLinks', clean))
  return snap.exists() ? ({ token: snap.id, ...snap.data() } as SessionLink) : null
}
