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
import { getPhoneCheck, getPurpose, has } from '../lib/purpose'
import { isAway, isoDate, parseDate, randomToken } from '../lib/format'
import { t } from '../lib/i18n'
import { type Over, activePlan, limitFor, locksOn, overPlan } from '../lib/plan'
import type { ClassKind, Delivery, GeoMode, Geofence, Session, SessionLink, UserProfile } from '../lib/types'

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
  kind?: ClassKind
  /** Location check carried over from the class, if it has one. */
  geofence?: Geofence
  /** Workplace rules carried over from the shift. */
  work?: { graceMin?: number | null; flexible?: boolean; rotating?: boolean; daysPerWeek?: number | null; minStaff?: number | null; breakMin?: number | null; countEarly?: boolean }
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
    ...(input.kind ? { kind: input.kind } : {}),
    meetingUrl: (input.meetingUrl ?? '').trim(),
    geoPoint: input.geofence?.geoPoint ?? null,
    geoRadius: input.geofence?.geoRadius ?? null,
    geoCos: input.geofence?.geoCos ?? null,
    geoMode: input.geofence?.geoPoint ? (input.geofence.geoMode ?? null) : null,
    ...(input.work?.graceMin != null ? { graceMin: input.work.graceMin } : {}),
    ...(input.work?.flexible ? { flexible: true } : {}),
    ...(input.work?.rotating ? { rotating: true } : {}),
    ...(input.work?.daysPerWeek ? { daysPerWeek: input.work.daysPerWeek } : {}),
    ...(input.work?.minStaff ? { minStaff: input.work.minStaff } : {}),
    ...(input.work?.breakMin ? { breakMin: input.work.breakMin } : {}),
    ...(input.work?.countEarly ? { countEarly: true } : {}),
    ...(has('clock') ? { phoneCheck: getPhoneCheck() } : {}),
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
  // Where people clock out, the QR must outlast the scheduled end: staff leave after it.
  const grace = has('clock') ? 4 * 60 * 60 * 1000 : 0
  return new Date(Math.max(end.getTime() + grace, Date.now() + MIN_OPEN_MS))
}

const newCode = () => randomToken(5)

/**
 * Opens attendance: issues a fresh token, publishes the public link document the QR
 * points at, and flips the session to active — atomically. Also used to reopen an ended
 * session: it gets a new token, so the QR that was closed stays dead.
 */
export async function startSession(session: Session, rotatingPref = false): Promise<void> {
  // A new session only: one being reopened was already counted when it first started.
  if (session.status === 'scheduled') await withinPlan(session)
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
      purpose: getPurpose(),
      geo: session.geoPoint ? (session.geoMode ?? null) : null,
      phoneCheck: session.phoneCheck ?? null,
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
      // With no class list anyone may type an ID, so the plan's class size is held here instead.
      cap: session.rosterId ? null : (limitFor('students') ?? null),
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

/** Why a session may not start, in words for the person on the screen. */
export function overPlanMessage(over: Over): string {
  const free = activePlan() === 'free'
  const n = { n: over.max, have: over.have }
  if (over.kind === 'lecturers')
    return over.max === 1
      ? t('Your plan is for one lecturer, and {have} can sign in to this account. Ask your admin to choose the Faculty plan, or to switch the others off, before starting a session.', n)
      : t('Your plan covers {n} lecturers, and {have} can sign in to this account. Ask your admin to add more, or to switch some off, before starting a session.', n)
  if (over.kind === 'staff') return t('Your plan covers {n} staff, and {have} are on your lists. Choose a bigger plan on the Account page, or remove some, before opening a new day.', n)
  if (over.kind === 'students')
    return free
      ? t('The free plan includes up to {n} students in a class, and this list has {have}. Upgrade to Pro to start it.', n)
      : t('Your plan includes up to {n} students in a class, and this list has {have}. For a bigger class, contact Dobry.', n)
  return has('clock')
    ? t('The free plan includes one office with one shift. Upgrade to add more.')
    : free
      ? t('The free plan includes 1 class, and you are running {have}. Upgrade to Pro, or end the others, to start a session.', n)
      : t('Your plan includes up to {n} classes at a time, and you are running {have}. End the ones that are over to start a session.', n)
}

/** Stops a new session when the organisation holds more than its plan covers. */
async function withinPlan(session: Session) {
  if (!locksOn() || activePlan() === 'early') return
  // Only what the limits need is read: this person's classes, for how many run now and the list's size.
  const mine = await getDocs(query(collection(db, 'classes'), where('organisationId', '==', session.organisationId), where('ownerId', '==', session.ownerId))).then(
    (snap) => snap.docs.map((d) => ({ id: d.id, ...(d.data() as { endDate?: string | null; rosterCount?: number }) })),
    () => null,
  )
  const today = isoDate()
  const over = overPlan(
    mine
      ? { classes: mine.filter((c) => !c.endDate || c.endDate >= today).length, students: mine.find((c) => c.id === (session.rosterId ?? session.classId))?.rosterCount }
      : {},
  )
  if (over) throw new Error(overPlanMessage(over))
}

/** How many single sessions (not part of a class) this person has made in the month of `date`. */
export async function singleSessionsInMonth(profile: UserProfile, date: string): Promise<number> {
  const snap = await getDocs(query(sessions, where('organisationId', '==', profile.organisationId), where('ownerId', '==', profile.id)))
  return snap.docs.filter((d) => !d.data().classId && String(d.data().date ?? '').slice(0, 7) === date.slice(0, 7)).length
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

/** The door screen gives every open shift the same code, so one QR serves them all. */
export const rotateCodeTo = (session: Session, code: string) =>
  updateDoc(doc(db, 'sessions', session.id), { qrCode: code, qrCodePrev: session.qrCode ?? null })

export const freshCode = () => newCode()

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
