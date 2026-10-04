import { readFileSync } from 'node:fs'
import { type RulesTestEnvironment, assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import {
  GeoPoint,
  Timestamp,
  writeBatch,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let env: RulesTestEnvironment

const future = Timestamp.fromMillis(Date.now() + 3600_000)
const past = Timestamp.fromMillis(Date.now() - 1000)

const user = (role: string, organisationId: string, extra = {}) => ({
  name: 'N', email: 'n@example.com', role, status: 'active', organisationId, ...extra,
})
const session = (ownerId: string, organisationId: string, extra = {}) => ({
  organisationId, ownerId, ownerName: 'N', name: 'Database Systems', description: '', date: '2026-10-01',
  startTime: '10:00', endTime: '12:00', expected: 42, mode: 'qr', status: 'scheduled', token: null,
  presentCount: 0, createdAt: null, startedAt: null, endedAt: null, expiresAt: null, ...extra,
})
const record = (sessionId: string, key: string, extra = {}) => ({
  sessionId, organisationId: 'orgA', ownerId: 'lecA', sessionName: 'Database Systems', date: '2026-10-01',
  token: 'ABC234', studentKey: key, studentId: key, studentName: 'Ahmad', timestamp: serverTimestamp(),
  status: 'present', method: 'qr', ...extra,
})

beforeAll(async () => {
  env = await initializeTestEnvironment({
    // Its own project, so a test run never wipes the data of an app using the same emulator.
    projectId: 'demo-attendance-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(() => env.cleanup())

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'organisations/orgA'), { name: 'A', ownerId: 'adminA', inviteCode: 'INVITEAA' })
    await setDoc(doc(db, 'invites/INVITEAA'), { organisationId: 'orgA', organisationName: 'A' })
    await setDoc(doc(db, 'users/adminA'), user('admin', 'orgA'))
    await setDoc(doc(db, 'users/lecA'), user('lecturer', 'orgA'))
    await setDoc(doc(db, 'users/lecA2'), user('lecturer', 'orgA'))
    await setDoc(doc(db, 'users/offA'), user('lecturer', 'orgA', { status: 'disabled' }))
    await setDoc(doc(db, 'users/lecB'), user('lecturer', 'orgB'))
    await setDoc(doc(db, 'users/adminB'), user('admin', 'orgB'))
    await setDoc(doc(db, 'sessions/live'), session('lecA', 'orgA', { status: 'active', token: 'ABC234', expiresAt: future }))
    await setDoc(doc(db, 'sessions/sched'), session('lecA', 'orgA'))
    await setDoc(doc(db, 'sessions/done'), session('lecA', 'orgA', { status: 'ended', token: 'DEF567', expiresAt: future }))
    await setDoc(doc(db, 'sessions/lapsed'), session('lecA', 'orgA', { status: 'active', token: 'GHJ789', expiresAt: past }))
    await setDoc(doc(db, 'sessionLinks/ABC234'), { sessionId: 'live', organisationId: 'orgA', ownerId: 'lecA', status: 'active' })
    await setDoc(doc(db, 'attendance/live_ST001'), { ...record('live', 'ST001'), timestamp: Timestamp.now() })
  })
})

const as = (uid: string) => env.authenticatedContext(uid, { email: 'n@example.com' }).firestore()
const anon = () => env.unauthenticatedContext().firestore()

describe('participants (no account)', () => {
  it('can check in to a live session with its token', () =>
    assertSucceeds(setDoc(doc(anon(), 'attendance/live_ST002'), record('live', 'ST002'))))

  it('cannot check in twice with the same student ID', () =>
    assertFails(setDoc(doc(anon(), 'attendance/live_ST001'), record('live', 'ST001', { studentName: 'Someone else' }))))

  it('can read back their own record by exact ID, but cannot list records', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'attendance/live_ST001')))
    await assertFails(getDocs(query(collection(anon(), 'attendance'), where('sessionId', '==', 'live'))))
  })

  it('cannot check in without the right token', () =>
    assertFails(setDoc(doc(anon(), 'attendance/live_ST002'), record('live', 'ST002', { token: 'WRONG1' }))))

  it('cannot check in to a session that has not started, has ended, or whose QR has lapsed', async () => {
    await assertFails(setDoc(doc(anon(), 'attendance/sched_ST002'), record('sched', 'ST002', { token: null })))
    await assertFails(setDoc(doc(anon(), 'attendance/done_ST002'), record('done', 'ST002', { token: 'DEF567' })))
    await assertFails(setDoc(doc(anon(), 'attendance/lapsed_ST002'), record('lapsed', 'ST002', { token: 'GHJ789' })))
  })

  it('cannot forge the timestamp, the owner, or the document ID', async () => {
    await assertFails(setDoc(doc(anon(), 'attendance/live_ST002'), record('live', 'ST002', { timestamp: past })))
    await assertFails(setDoc(doc(anon(), 'attendance/live_ST002'), record('live', 'ST002', { ownerId: 'lecB' })))
    await assertFails(setDoc(doc(anon(), 'attendance/live_OTHER'), record('live', 'ST002')))
    await assertFails(setDoc(doc(anon(), 'attendance/live_ST002'), record('live', 'ST002', { extra: true })))
  })

  it('cannot edit or delete a record, or read sessions and users', async () => {
    await assertFails(updateDoc(doc(anon(), 'attendance/live_ST001'), { status: 'excused' }))
    await assertFails(updateDoc(doc(anon(), 'attendance/live_ST001'), { studentName: 'X' }))
    await assertFails(deleteDoc(doc(anon(), 'attendance/live_ST001')))
    await assertFails(getDoc(doc(anon(), 'sessions/live')))
    await assertFails(getDoc(doc(anon(), 'users/lecA')))
  })

  it('can resolve a QR token but cannot list or alter links', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'sessionLinks/ABC234')))
    await assertFails(getDocs(collection(anon(), 'sessionLinks')))
    await assertFails(updateDoc(doc(anon(), 'sessionLinks/ABC234'), { status: 'ended' }))
  })
})

describe('lecturers', () => {
  const mine = (uid: string, org: string) =>
    query(collection(as(uid), 'sessions'), where('organisationId', '==', org), where('ownerId', '==', uid))

  it('see their own sessions and attendance', async () => {
    await assertSucceeds(getDocs(mine('lecA', 'orgA')))
    await assertSucceeds(getDoc(doc(as('lecA'), 'sessions/live')))
    await assertSucceeds(getDocs(query(collection(as('lecA'), 'attendance'),
      where('organisationId', '==', 'orgA'), where('sessionId', '==', 'live'), where('ownerId', '==', 'lecA'))))
  })

  it("cannot see a colleague's sessions or attendance", async () => {
    await assertFails(getDoc(doc(as('lecA2'), 'sessions/live')))
    await assertFails(getDocs(query(collection(as('lecA2'), 'sessions'), where('organisationId', '==', 'orgA'))))
    await assertFails(getDocs(query(collection(as('lecA2'), 'attendance'),
      where('organisationId', '==', 'orgA'), where('sessionId', '==', 'live'))))
  })

  it('can create a session only for themselves, in their own organisation', async () => {
    await assertSucceeds(setDoc(doc(as('lecA'), 'sessions/new1'), session('lecA', 'orgA')))
    await assertFails(setDoc(doc(as('lecA'), 'sessions/new2'), session('lecA2', 'orgA')))
    await assertFails(setDoc(doc(as('lecA'), 'sessions/new3'), session('lecA', 'orgB')))
    await assertFails(setDoc(doc(as('lecA'), 'sessions/new4'), session('lecA', 'orgA', { status: 'active' })))
  })

  it('can start and end; a token never changes while a session is open', async () => {
    const db = as('lecA')
    await assertSucceeds(setDoc(doc(db, 'sessionLinks/NEW234'), { sessionId: 'sched', organisationId: 'orgA', ownerId: 'lecA', status: 'active' }))
    await assertSucceeds(updateDoc(doc(db, 'sessions/sched'), { status: 'active', token: 'NEW234', expiresAt: future }))
    await assertFails(updateDoc(doc(db, 'sessions/sched'), { token: 'ZZZ999' }))
    await assertSucceeds(updateDoc(doc(db, 'sessions/sched'), { status: 'ended' }))
    await assertSucceeds(updateDoc(doc(db, 'sessionLinks/NEW234'), { status: 'ended' }))
    await assertFails(updateDoc(doc(db, 'sessionLinks/NEW234'), { status: 'active' }))
  })

  it('can reopen an ended session only with a new token, and the old QR stays dead', async () => {
    const db = as('lecA')
    // Reusing the closed token is refused, and so is a colleague or an admin reopening it.
    await assertFails(updateDoc(doc(db, 'sessions/done'), { status: 'active' }))
    await assertFails(updateDoc(doc(as('adminA'), 'sessions/done'), { status: 'active', token: 'RE0PEN' }))
    await assertSucceeds(updateDoc(doc(db, 'sessions/done'), { status: 'active', token: 'RE0PEN', expiresAt: future }))
    await assertFails(setDoc(doc(anon(), 'attendance/done_ST002'), record('done', 'ST002', { token: 'DEF567' })))
    await assertSucceeds(setDoc(doc(anon(), 'attendance/done_ST002'), record('done', 'ST002', { token: 'RE0PEN' })))
  })

  it('can record someone by hand and correct a status, during and after the session', async () => {
    const manual = (sid: string, key: string, extra = {}) => ({
      sessionId: sid, organisationId: 'orgA', ownerId: 'lecA', sessionName: 'Database Systems', date: '2026-10-01',
      studentKey: key, studentId: key, studentName: 'Kumar', timestamp: serverTimestamp(),
      status: 'present', method: 'manual', markedBy: 'lecA', ...extra,
    })
    const db = as('lecA')
    await assertSucceeds(setDoc(doc(db, 'attendance/live_ST010'), manual('live', 'ST010')))
    await assertSucceeds(setDoc(doc(db, 'attendance/done_ST011'), manual('done', 'ST011', { status: 'excused' })))
    await assertFails(setDoc(doc(db, 'attendance/sched_ST012'), manual('sched', 'ST012')))
    await assertFails(setDoc(doc(db, 'attendance/live_ST013'), manual('live', 'ST013', { status: 'absent' })))
    await assertSucceeds(updateDoc(doc(db, 'attendance/live_ST001'), { status: 'late' }))
    await assertFails(updateDoc(doc(db, 'attendance/live_ST001'), { studentName: 'Changed' }))
    await assertSucceeds(updateDoc(doc(db, 'attendance/live_ST001'), { status: 'mc' }))
    await assertFails(updateDoc(doc(db, 'attendance/live_ST001'), { status: 'vip' }))
    // Nobody else can: not a participant, not a colleague, not another organisation.
    await assertFails(setDoc(doc(anon(), 'attendance/live_ST014'), manual('live', 'ST014')))
    await assertFails(setDoc(doc(as('lecA2'), 'attendance/live_ST015'), manual('live', 'ST015', { markedBy: 'lecA2' })))
    await assertFails(setDoc(doc(as('adminB'), 'attendance/live_ST016'), manual('live', 'ST016', { markedBy: 'adminB' })))
    await assertFails(updateDoc(doc(as('lecA2'), 'attendance/live_ST001'), { status: 'excused' }))
    await assertSucceeds(setDoc(doc(as('adminA'), 'attendance/live_ST017'), manual('live', 'ST017', { markedBy: 'adminA' })))
  })

  it('with a rotating QR, only a fresh scan is accepted', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'sessions/live'), { qrCode: 'NEW11', qrCodePrev: 'OLD22' })
    })
    await assertFails(setDoc(doc(anon(), 'attendance/live_ST020'), record('live', 'ST020')))
    await assertFails(setDoc(doc(anon(), 'attendance/live_ST020'), record('live', 'ST020', { code: 'STALE' })))
    await assertFails(setDoc(doc(anon(), 'attendance/live_ST020'), record('live', 'ST020', { code: '' })))
    await assertSucceeds(setDoc(doc(anon(), 'attendance/live_ST020'), record('live', 'ST020', { code: 'NEW11' })))
    await assertSucceeds(setDoc(doc(anon(), 'attendance/live_ST021'), record('live', 'ST021', { code: 'OLD22' })))
    // First turn of a rotation: there is no previous code, and "no code" must not match it.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'sessions/live'), { qrCode: 'NEW11', qrCodePrev: null })
    })
    await assertFails(setDoc(doc(anon(), 'attendance/live_ST022'), record('live', 'ST022')))
  })

  it("cannot take over an existing link or publish one for someone else's session", async () => {
    await assertFails(setDoc(doc(as('lecA2'), 'sessionLinks/ABC234'), { sessionId: 'live', organisationId: 'orgA', ownerId: 'lecA2', status: 'active' }))
    await assertFails(setDoc(doc(as('lecA2'), 'sessionLinks/NEW234'), { sessionId: 'live', organisationId: 'orgA', ownerId: 'lecA2', status: 'active' }))
  })

  it('can delete only sessions that never started', async () => {
    await assertFails(deleteDoc(doc(as('lecA'), 'sessions/done')))
    await assertSucceeds(deleteDoc(doc(as('lecA'), 'sessions/sched')))
  })

  it('cannot promote themselves, list users, or do anything once disabled', async () => {
    await assertFails(updateDoc(doc(as('lecA'), 'users/lecA'), { role: 'admin' }))
    await assertFails(getDocs(query(collection(as('lecA'), 'users'), where('organisationId', '==', 'orgA'))))
    await assertFails(setDoc(doc(as('offA'), 'sessions/new9'), session('offA', 'orgA')))
  })
})

describe('weekly timetable', () => {
  const cls = (ownerId: string, organisationId: string, extra = {}) => ({
    organisationId, ownerId, ownerName: 'N', name: 'Database Systems', description: '', days: [1, 3],
    slots: [{ day: 1, startTime: '10:00', endTime: '12:00' }, { day: 3, startTime: '14:00', endTime: '16:00' }],
    startTime: '10:00', endTime: '12:00', expected: 42, createdAt: null, ...extra,
  })

  it('lets a lecturer manage their own classes only', async () => {
    const db = as('lecA')
    await assertSucceeds(setDoc(doc(db, 'classes/c1'), cls('lecA', 'orgA')))
    await assertSucceeds(updateDoc(doc(db, 'classes/c1'), { days: [2] }))
    await assertSucceeds(getDocs(query(collection(db, 'classes'), where('organisationId', '==', 'orgA'), where('ownerId', '==', 'lecA'))))
    await assertFails(setDoc(doc(db, 'classes/c2'), cls('lecA2', 'orgA')))
    await assertFails(setDoc(doc(db, 'classes/c3'), cls('lecA', 'orgB')))
    await assertFails(setDoc(doc(db, 'classes/c4'), cls('lecA', 'orgA', { days: [] })))
    await assertFails(setDoc(doc(db, 'classes/c5'), cls('lecA', 'orgA', { days: [9] })))
    await assertFails(setDoc(doc(db, 'classes/c6'), cls('lecA', 'orgA', { slots: [] })))
    await assertFails(updateDoc(doc(db, 'classes/c1'), { ownerId: 'lecB' }))
    await assertFails(getDoc(doc(as('lecA2'), 'classes/c1')))
    await assertFails(updateDoc(doc(as('lecA2'), 'classes/c1'), { name: 'X' }))
    await assertFails(getDoc(doc(as('adminB'), 'classes/c1')))
    await assertSucceeds(deleteDoc(doc(db, 'classes/c1')))
  })

  it('creates at most one session per class per day', async () => {
    const db = as('lecA')
    await assertSucceeds(setDoc(doc(db, 'sessions/c1_2026-10-01'), session('lecA', 'orgA', { classId: 'c1', createdAt: serverTimestamp() })))
    await assertFails(setDoc(doc(db, 'sessions/c1_2026-10-01'), session('lecA', 'orgA', { classId: 'c1', createdAt: serverTimestamp() })))
    await assertSucceeds(getDoc(doc(db, 'sessions/c1_2026-10-01')))
  })
})

describe('class student lists', () => {
  const entry = (key: string, name: string, extra = {}) => ({
    studentKey: key, studentId: key, studentName: name, organisationId: 'orgA', ownerId: 'lecA', ...extra,
  })

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'classes/c1'), { organisationId: 'orgA', ownerId: 'lecA', name: 'DB', days: [1], startTime: '10:00', endTime: '12:00' })
      await setDoc(doc(db, 'rosters/c1/students/ST001'), entry('ST001', 'Ahmad bin Ali'))
      await setDoc(doc(db, 'sessions/listed'), session('lecA', 'orgA', { status: 'active', token: 'LST234', expiresAt: future, rosterId: 'c1' }))
    })
  })

  it('only the class owner can change the list; owner and admin can read it', async () => {
    await assertSucceeds(setDoc(doc(as('lecA'), 'rosters/c1/students/ST002'), entry('ST002', 'Siti')))
    await assertFails(setDoc(doc(as('lecA'), 'rosters/c1/students/ST003'), entry('WRONG', 'Kumar')))
    await assertFails(setDoc(doc(as('lecA2'), 'rosters/c1/students/ST009'), entry('ST009', 'X', { ownerId: 'lecA2' })))
    await assertFails(setDoc(doc(as('lecB'), 'rosters/c1/students/ST009'), entry('ST009', 'X', { ownerId: 'lecB', organisationId: 'orgB' })))
    const list = (uid: string, owner?: string) => getDocs(query(collection(as(uid), 'rosters/c1/students'),
      where('organisationId', '==', 'orgA'), ...(owner ? [where('ownerId', '==', owner)] : [])))
    await assertSucceeds(list('lecA', 'lecA'))
    await assertSucceeds(list('adminA'))
    await assertFails(list('lecA2'))
    await assertFails(list('adminB'))
    await assertFails(deleteDoc(doc(as('lecA2'), 'rosters/c1/students/ST001')))
    await assertSucceeds(deleteDoc(doc(as('lecA'), 'rosters/c1/students/ST001')))
  })

  it('participants can look up one exact ID but never the whole list', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'rosters/c1/students/ST001')))
    await assertFails(getDocs(collection(anon(), 'rosters/c1/students')))
    await assertFails(setDoc(doc(anon(), 'rosters/c1/students/ST005'), entry('ST005', 'Me')))
  })

  it('a session with a list only accepts listed IDs, under the listed name', async () => {
    const r = (key: string, name: string) => record('listed', key, { token: 'LST234', studentName: name })
    await assertFails(setDoc(doc(anon(), 'attendance/listed_ST777'), r('ST777', 'Not On List')))
    await assertFails(setDoc(doc(anon(), 'attendance/listed_ST001'), r('ST001', 'Made Up Name')))
    await assertSucceeds(setDoc(doc(anon(), 'attendance/listed_ST001'), r('ST001', 'Ahmad bin Ali')))
  })
})

describe('online sessions: link flags and presence checks', () => {
  const checkin = (key: string, extra = {}) => ({
    sessionId: 'live', organisationId: 'orgA', ownerId: 'lecA', n: 1, studentKey: key, token: 'ABC234',
    timestamp: serverTimestamp(), ...extra,
  })
  const open = (expiresAt = future) => env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'sessions/live'), { checkpoint: { n: 1, expiresAt }, checkpointCount: 1 })
  })

  it('the owner can flag that a code is needed and open a check on the link, nothing else', async () => {
    const db = as('lecA')
    await assertSucceeds(updateDoc(doc(db, 'sessionLinks/ABC234'), { needsCode: true }))
    await assertSucceeds(updateDoc(doc(db, 'sessionLinks/ABC234'), { checkpoint: { n: 1, expiresAt: future } }))
    await assertFails(updateDoc(doc(db, 'sessionLinks/ABC234'), { sessionId: 'sched' }))
    await assertFails(updateDoc(doc(anon(), 'sessionLinks/ABC234'), { needsCode: false }))
    await assertFails(updateDoc(doc(as('lecA2'), 'sessionLinks/ABC234'), { needsCode: false }))
  })

  it('a checked-in student can confirm an open check exactly once', async () => {
    await open()
    await assertSucceeds(setDoc(doc(anon(), 'checkins/live_1_ST001'), checkin('ST001')))
    await assertFails(setDoc(doc(anon(), 'checkins/live_1_ST001'), checkin('ST001')))
  })

  it('refuses a confirmation with no check open, after it closes, or for the wrong check', async () => {
    await assertFails(setDoc(doc(anon(), 'checkins/live_1_ST001'), checkin('ST001')))
    await open(past)
    await assertFails(setDoc(doc(anon(), 'checkins/live_1_ST001'), checkin('ST001')))
    await open()
    await assertFails(setDoc(doc(anon(), 'checkins/live_2_ST001'), checkin('ST001', { n: 2 })))
  })

  it('refuses a confirmation from someone who never checked in, or without the token', async () => {
    await open()
    await assertFails(setDoc(doc(anon(), 'checkins/live_1_ST999'), checkin('ST999')))
    await assertFails(setDoc(doc(anon(), 'checkins/live_1_ST001'), checkin('ST001', { token: 'WRONG1' })))
    await assertFails(setDoc(doc(anon(), 'checkins/live_1_OTHER'), checkin('ST001')))
  })

  it('only the lecturer and their admin can see who confirmed', async () => {
    await open()
    await setDoc(doc(anon(), 'checkins/live_1_ST001'), checkin('ST001'))
    const list = (who: ReturnType<typeof as>, owner?: string) => getDocs(query(collection(who, 'checkins'),
      where('organisationId', '==', 'orgA'), where('sessionId', '==', 'live'), ...(owner ? [where('ownerId', '==', owner)] : [])))
    await assertSucceeds(list(as('lecA'), 'lecA'))
    await assertSucceeds(list(as('adminA')))
    await assertFails(list(as('lecA2')))
    await assertFails(list(as('adminB')))
    await assertFails(getDoc(doc(anon(), 'checkins/live_1_ST001')))
  })
})

describe('location check', () => {
  // Universiti Teknologi Malaysia, and a point about 1.1 km north of it.
  const classroom = new GeoPoint(1.5590, 103.6380)
  const inRoom = new GeoPoint(1.5594, 103.6383)
  const farAway = new GeoPoint(1.5690, 103.6380)
  const fence = (geoMode: string) => env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'sessions/live'), { geoPoint: classroom, geoRadius: 150, geoMode, geoCos: Math.cos((1.559 * Math.PI) / 180) })
  })
  const location = (key: string, point: GeoPoint, extra = {}) => ({
    sessionId: 'live', organisationId: 'orgA', ownerId: 'lecA', studentKey: key, point, accuracy: 20,
    timestamp: serverTimestamp(), ...extra,
  })
  const checkIn = (key: string, point?: GeoPoint) => {
    const db = anon()
    const batch = writeBatch(db)
    if (point) batch.set(doc(db, `locations/live_${key}`), location(key, point))
    batch.set(doc(db, `attendance/live_${key}`), record('live', key))
    return batch.commit()
  }

  it('"refuse check-in" accepts a student in the room and refuses one who is far away or shares nothing', async () => {
    await fence('block')
    await assertSucceeds(checkIn('ST030', inRoom))
    await assertFails(checkIn('ST031', farAway))
    // About 140 m east is inside the 150 m radius; about 170 m east is outside.
    await assertSucceeds(checkIn('ST037', new GeoPoint(1.5590, 103.63926)))
    await assertFails(checkIn('ST038', new GeoPoint(1.5590, 103.63953)))
    await assertFails(checkIn('ST032'))
  })

  it('"warn only" accepts everyone, wherever they are', async () => {
    await fence('flag')
    await assertSucceeds(checkIn('ST033', farAway))
    await assertSucceeds(checkIn('ST034'))
  })

  it('the lecturer can still mark a student by hand in "refuse check-in" mode', async () => {
    await fence('block')
    await assertSucceeds(setDoc(doc(as('lecA'), 'attendance/live_ST035'), {
      sessionId: 'live', organisationId: 'orgA', ownerId: 'lecA', sessionName: 'Database Systems', date: '2026-10-01',
      studentKey: 'ST035', studentId: 'ST035', studentName: 'Kumar', timestamp: serverTimestamp(),
      status: 'present', method: 'manual', markedBy: 'lecA',
    }))
  })

  it("a student's location is visible only to the lecturer and their admin, and cannot be changed", async () => {
    await fence('flag')
    await checkIn('ST036', inRoom)
    await assertFails(getDoc(doc(anon(), 'locations/live_ST036')))
    await assertFails(getDoc(doc(as('lecA2'), 'locations/live_ST036')))
    await assertFails(getDoc(doc(as('adminB'), 'locations/live_ST036')))
    await assertSucceeds(getDoc(doc(as('lecA'), 'locations/live_ST036')))
    await assertSucceeds(getDoc(doc(as('adminA'), 'locations/live_ST036')))
    await assertFails(setDoc(doc(anon(), 'locations/live_ST036'), location('ST036', farAway)))
    await assertFails(setDoc(doc(anon(), 'locations/live_OTHER'), location('ST036', inRoom)))
  })

  it('only the owner can switch the check on the public link', async () => {
    await assertSucceeds(updateDoc(doc(as('lecA'), 'sessionLinks/ABC234'), { geo: 'block' }))
    await assertFails(updateDoc(doc(anon(), 'sessionLinks/ABC234'), { geo: null }))
  })
})

describe('MC remarks and evidence', () => {
  const ev = (extra = {}) => ({
    sessionId: 'live', organisationId: 'orgA', ownerId: 'lecA', studentKey: 'ST001',
    remarks: 'Klinik Kesihatan, MC 1 Oct', fileName: null, mimeType: null, dataUrl: null, ...extra,
  })

  it('the lecturer and their admin can save and read it', async () => {
    await assertSucceeds(setDoc(doc(as('lecA'), 'evidence/live_ST001'), ev()))
    await assertSucceeds(getDoc(doc(as('lecA'), 'evidence/live_ST001')))
    await assertSucceeds(getDoc(doc(as('adminA'), 'evidence/live_ST001')))
    await assertSucceeds(updateDoc(doc(as('lecA'), 'evidence/live_ST001'), { remarks: 'Updated' }))
  })

  it('participants, colleagues and other organisations cannot read or write it', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'evidence/live_ST001'), ev()))
    await assertFails(getDoc(doc(anon(), 'evidence/live_ST001')))
    await assertFails(getDoc(doc(as('lecA2'), 'evidence/live_ST001')))
    await assertFails(getDoc(doc(as('adminB'), 'evidence/live_ST001')))
    await assertFails(setDoc(doc(anon(), 'evidence/live_ST002'), ev({ studentKey: 'ST002' })))
    await assertFails(setDoc(doc(as('lecA2'), 'evidence/live_ST002'), ev({ studentKey: 'ST002', ownerId: 'lecA2' })))
    await assertFails(setDoc(doc(as('lecA'), 'evidence/live_OTHER'), ev()))
  })

  it('refuses an oversized file or remark', async () => {
    await assertFails(setDoc(doc(as('lecA'), 'evidence/live_ST001'), ev({ remarks: 'x'.repeat(501) })))
    await assertFails(setDoc(doc(as('lecA'), 'evidence/live_ST001'), ev({ dataUrl: 'x'.repeat(990001) })))
  })
})

describe('organisations are isolated', () => {
  it('nobody in organisation B can read organisation A, not even its admin', async () => {
    for (const uid of ['lecB', 'adminB']) {
      const db = as(uid)
      await assertFails(getDoc(doc(db, 'sessions/live')))
      await assertFails(getDocs(query(collection(db, 'sessions'), where('organisationId', '==', 'orgA'))))
      await assertFails(getDocs(query(collection(db, 'attendance'), where('organisationId', '==', 'orgA'))))
      await assertFails(getDocs(query(collection(db, 'users'), where('organisationId', '==', 'orgA'))))
      await assertFails(getDoc(doc(db, 'organisations/orgA')))
      await assertFails(updateDoc(doc(db, 'sessions/live'), { status: 'ended' }))
      await assertFails(deleteDoc(doc(db, 'attendance/live_ST001')))
    }
  })
})

describe('admins', () => {
  it('see every session, record and user in their organisation', async () => {
    const db = as('adminA')
    await assertSucceeds(getDocs(query(collection(db, 'sessions'), where('organisationId', '==', 'orgA'))))
    await assertSucceeds(getDocs(query(collection(db, 'attendance'), where('organisationId', '==', 'orgA'))))
    await assertSucceeds(getDocs(query(collection(db, 'users'), where('organisationId', '==', 'orgA'))))
  })

  it('can manage other users but cannot move them to another organisation or demote themselves', async () => {
    const db = as('adminA')
    await assertSucceeds(updateDoc(doc(db, 'users/lecA'), { role: 'admin' }))
    await assertSucceeds(updateDoc(doc(db, 'users/lecA2'), { status: 'disabled' }))
    await assertFails(updateDoc(doc(db, 'users/lecA2'), { organisationId: 'orgB' }))
    await assertFails(updateDoc(doc(db, 'users/adminA'), { role: 'lecturer' }))
    await assertFails(updateDoc(doc(db, 'users/lecB'), { status: 'disabled' }))
  })
})

describe('sign-up', () => {
  const profile = (role: string, organisationId: string, extra = {}) => ({
    name: 'New', email: 'n@example.com', role, status: 'active', organisationId, createdAt: serverTimestamp(), ...extra,
  })

  it('creates an organisation and becomes its admin', async () => {
    const db = as('newbie')
    await assertSucceeds(setDoc(doc(db, 'organisations/orgC'), { name: 'C', ownerId: 'newbie', inviteCode: 'X' }))
    await assertSucceeds(setDoc(doc(db, 'users/newbie'), profile('admin', 'orgC')))
    await assertSucceeds(setDoc(doc(db, 'invites/INVITECC'), { organisationId: 'orgC', organisationName: 'C', createdAt: serverTimestamp() }))
  })

  it('joins as a lecturer only with a valid invite code', async () => {
    await assertSucceeds(setDoc(doc(as('joiner'), 'users/joiner'), profile('lecturer', 'orgA', { inviteCode: 'INVITEAA' })))
    await assertFails(setDoc(doc(as('joiner2'), 'users/joiner2'), profile('lecturer', 'orgA', { inviteCode: 'NOPE' })))
    await assertFails(setDoc(doc(as('joiner3'), 'users/joiner3'), profile('lecturer', 'orgB', { inviteCode: 'INVITEAA' })))
  })

  it("cannot make itself admin of someone else's organisation", async () => {
    await assertFails(setDoc(doc(as('intruder'), 'users/intruder'), profile('admin', 'orgA')))
    await assertFails(setDoc(doc(as('intruder'), 'users/intruder'), profile('admin', 'orgA', { inviteCode: 'INVITEAA' })))
  })
})

describe('purpose and plan are fixed at sign-up', () => {
  it('an admin can rename the organisation but not change what it is for or its plan', async () => {
    const db = as('adminA')
    await assertSucceeds(updateDoc(doc(db, 'organisations/orgA'), { name: 'Renamed' }))
    await assertFails(updateDoc(doc(db, 'organisations/orgA'), { purpose: 'workplace' }))
    await assertFails(updateDoc(doc(db, 'organisations/orgA'), { plan: 'pro' }))
    await assertSucceeds(updateDoc(doc(db, 'organisations/orgA'), { shifts: true }))
    await assertFails(updateDoc(doc(db, 'organisations/orgA'), { shifts: 'yes' }))
    await assertFails(updateDoc(doc(as('lecA'), 'organisations/orgA'), { shifts: false }))
    await assertSucceeds(updateDoc(doc(db, 'organisations/orgA'), { otRule: 'end', timezone: 'Asia/Kuala_Lumpur' }))
    await assertFails(updateDoc(doc(db, 'organisations/orgA'), { otRule: 'always' }))
    await assertFails(updateDoc(doc(db, 'organisations/orgA'), { timezone: 'x'.repeat(65) }))
    await assertFails(updateDoc(doc(as('lecA'), 'organisations/orgA'), { otRule: 'end' }))
    await assertFails(updateDoc(doc(db, 'organisations/orgA'), { paidUntil: future }))
    await assertFails(updateDoc(doc(db, 'organisations/orgA'), { trialStarted: serverTimestamp() }))
  })

  it('a new organisation picks its purpose but cannot start on a paid plan', async () => {
    const db = as('newbie')
    await assertSucceeds(setDoc(doc(db, 'organisations/orgD'), { name: 'D', ownerId: 'newbie', inviteCode: 'X', purpose: 'workplace', plan: 'early' }))
    await assertSucceeds(setDoc(doc(db, 'organisations/orgG'), { name: 'G', ownerId: 'newbie', inviteCode: 'X', plan: 'trial', trialStarted: serverTimestamp() }))
    await assertFails(setDoc(doc(db, 'organisations/orgH'), { name: 'H', ownerId: 'newbie', inviteCode: 'X', plan: 'trial', trialStarted: Timestamp.fromMillis(Date.now() + 86_400_000 * 365) }))
    await assertFails(setDoc(doc(db, 'organisations/orgI'), { name: 'I', ownerId: 'newbie', inviteCode: 'X', plan: 'early', seats: 100 }))
    await assertFails(setDoc(doc(db, 'organisations/orgE'), { name: 'E', ownerId: 'newbie', inviteCode: 'X', plan: 'pro' }))
    await assertFails(setDoc(doc(db, 'organisations/orgF'), { name: 'F', ownerId: 'newbie', inviteCode: 'X', purpose: 'bank' }))
  })
})

describe('clock-out (workplace)', () => {
  const out = (key: string, extra = {}) => ({
    sessionId: 'live', organisationId: 'orgA', ownerId: 'lecA', studentKey: key, token: 'ABC234', by: 'self', timestamp: serverTimestamp(), ...extra,
  })
  const byManager = (uid: string, key: string) => ({
    sessionId: 'live', organisationId: 'orgA', ownerId: 'lecA', studentKey: key, by: uid, timestamp: serverTimestamp(),
  })

  it('someone who clocked in can clock out once, with the session token', async () => {
    await assertSucceeds(setDoc(doc(anon(), 'clockouts/live_ST001'), out('ST001')))
    await assertSucceeds(getDoc(doc(anon(), 'clockouts/live_ST001')))
  })

  it('refuses a clock-out without a clock-in, with a wrong token, or with a made-up time', async () => {
    await assertFails(setDoc(doc(anon(), 'clockouts/live_ST009'), out('ST009')))
    await assertFails(setDoc(doc(anon(), 'clockouts/live_ST001'), out('ST001', { token: 'WRONG1' })))
    await assertFails(setDoc(doc(anon(), 'clockouts/live_ST001'), out('ST001', { timestamp: Timestamp.fromMillis(Date.now() - 3600_000) })))
  })

  it('needs a fresh code when the QR rotates', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'sessions/live'), { qrCode: 'AAAAA', qrCodePrev: 'BBBBB' }))
    await assertFails(setDoc(doc(anon(), 'clockouts/live_ST001'), out('ST001')))
    await assertFails(setDoc(doc(anon(), 'clockouts/live_ST001'), out('ST001', { code: 'ZZZZZ' })))
    await assertSucceeds(setDoc(doc(anon(), 'clockouts/live_ST001'), out('ST001', { code: 'BBBBB' })))
  })

  it('a manager may fill in an earlier clock-out, never a later one; staff cannot pick a time', async () => {
    const earlier = Timestamp.fromMillis(Date.now() - 1800_000)
    await assertFails(setDoc(doc(as('lecA'), 'clockouts/live_ST001'), { ...byManager('lecA', 'ST001'), timestamp: Timestamp.fromMillis(Date.now() + 3600_000) }))
    await assertFails(setDoc(doc(anon(), 'clockouts/live_ST001'), out('ST001', { timestamp: earlier })))
    await assertSucceeds(setDoc(doc(as('lecA'), 'clockouts/live_ST001'), { ...byManager('lecA', 'ST001'), timestamp: earlier }))
  })

  it('the manager can clock someone out and undo it; a colleague cannot', async () => {
    await assertFails(setDoc(doc(as('lecA2'), 'clockouts/live_ST001'), byManager('lecA2', 'ST001')))
    await assertSucceeds(setDoc(doc(as('lecA'), 'clockouts/live_ST001'), byManager('lecA', 'ST001')))
    await assertFails(deleteDoc(doc(as('lecA2'), 'clockouts/live_ST001')))
    await assertFails(deleteDoc(doc(anon(), 'clockouts/live_ST001')))
    await assertSucceeds(deleteDoc(doc(as('lecA'), 'clockouts/live_ST001')))
  })
})

describe('departments on a staff list', () => {
  const entry = (extra = {}) => ({ studentKey: 'E001', studentId: 'E001', studentName: 'Ahmad', organisationId: 'orgA', ownerId: 'lecA', ...extra })
  beforeEach(() =>
    env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'classes/shift'), { organisationId: 'orgA', ownerId: 'lecA', name: 'Shift' })),
  )

  it('accepts a short department and refuses anything else extra', async () => {
    await assertSucceeds(setDoc(doc(as('lecA'), 'rosters/shift/students/E001'), entry({ department: 'Sales' })))
    await assertSucceeds(setDoc(doc(as('lecA'), 'rosters/shift/students/E001'), entry()))
    await assertFails(setDoc(doc(as('lecA'), 'rosters/shift/students/E001'), entry({ department: 'x'.repeat(61) })))
    await assertFails(setDoc(doc(as('lecA'), 'rosters/shift/students/E001'), entry({ salary: 5000 })))
  })
})

describe('shift plans', () => {
  const plan = (extra = {}) => ({ organisationId: 'orgA', ownerId: 'lecA', rosterId: 'shift', week: '2026-10-05', cells: { E001: { '2026-10-05': 'shift' } }, updatedAt: serverTimestamp(), ...extra })
  beforeEach(() =>
    env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'classes/shift'), { organisationId: 'orgA', ownerId: 'lecA', name: 'Shift' })),
  )

  it('the manager who keeps the list can plan it; nobody else can read or write it', async () => {
    await assertSucceeds(setDoc(doc(as('lecA'), 'plans/shift_2026-10-05'), plan()))
    await assertSucceeds(getDocs(query(collection(as('lecA'), 'plans'), where('organisationId', '==', 'orgA'), where('rosterId', '==', 'shift'), where('week', 'in', ['2026-10-05']), where('ownerId', '==', 'lecA'))))
    await assertFails(setDoc(doc(as('lecA2'), 'plans/shift_2026-10-12'), plan({ ownerId: 'lecA2', week: '2026-10-12' })))
    await assertFails(setDoc(doc(as('lecA'), 'plans/other_2026-10-05'), plan()))
    await assertFails(getDoc(doc(as('lecA2'), 'plans/shift_2026-10-05')))
    await assertFails(getDoc(doc(anon(), 'plans/shift_2026-10-05')))
    await assertFails(getDoc(doc(as('adminB'), 'plans/shift_2026-10-05')))
  })
})

describe('handing an office to a branch manager', () => {
  const office = { organisationId: 'orgA', ownerId: 'lecA', ownerName: 'N', name: 'Penang', slots: [{ day: 1, startTime: '09:00', endTime: '17:00' }], days: [1] }
  const entry = (owner: string) => ({ studentKey: 'E001', studentId: 'E001', studentName: 'Ahmad', organisationId: 'orgA', ownerId: owner })
  const list = (uid: string) => getDocs(query(collection(as(uid), 'rosters/office/students'), where('organisationId', '==', 'orgA')))
  beforeEach(() =>
    env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'classes/office'), office)
      await setDoc(doc(ctx.firestore(), 'rosters/office/students/E001'), entry('lecA'))
    }),
  )

  it('only to an active colleague in the same organisation, and nothing else may change with it', async () => {
    await assertFails(updateDoc(doc(as('lecA'), 'classes/office'), { ownerId: 'lecB', ownerName: 'B' }))
    await assertFails(updateDoc(doc(as('lecA'), 'classes/office'), { ownerId: 'offA', ownerName: 'Off' }))
    await assertFails(updateDoc(doc(as('lecA'), 'classes/office'), { ownerId: 'lecA2', ownerName: 'A2', organisationId: 'orgB' }))
    await assertFails(updateDoc(doc(as('lecA2'), 'classes/office'), { ownerId: 'lecA2', ownerName: 'A2' }))
    await assertSucceeds(updateDoc(doc(as('lecA'), 'classes/office'), { ownerId: 'lecA2', ownerName: 'A2' }))
  })

  it('the staff list follows the office: the new manager reads and edits it, the old one no longer does', async () => {
    await assertSucceeds(list('lecA'))
    await assertFails(list('lecA2'))
    await assertSucceeds(updateDoc(doc(as('lecA'), 'classes/office'), { ownerId: 'lecA2', ownerName: 'A2' }))
    await assertSucceeds(list('lecA2'))
    await assertFails(list('lecA'))
    await assertSucceeds(list('adminA'))
    await assertSucceeds(setDoc(doc(as('lecA2'), 'rosters/office/students/E002'), { ...entry('lecA2'), studentKey: 'E002', studentId: 'E002' }))
    await assertSucceeds(deleteDoc(doc(as('lecA2'), 'rosters/office/students/E001')))
    await assertFails(list('lecB'))
  })
})

describe('workplace gaps', () => {
  it('a check-in may carry a short phone label and nothing longer', async () => {
    await assertSucceeds(setDoc(doc(anon(), 'attendance/live_ST002'), record('live', 'ST002', { device: 'ABCDEFGH12345678' })))
    await assertFails(setDoc(doc(anon(), 'attendance/live_ST003'), record('live', 'ST003', { device: 'x'.repeat(41) })))
    await assertFails(setDoc(doc(anon(), 'attendance/live_ST004'), record('live', 'ST004', { device: 123 })))
  })

  it('clocking out again moves the time, but only with the session token', async () => {
    const out = (extra = {}) => ({ sessionId: 'live', organisationId: 'orgA', ownerId: 'lecA', studentKey: 'ST001', token: 'ABC234', by: 'self', timestamp: serverTimestamp(), ...extra })
    await assertSucceeds(setDoc(doc(anon(), 'clockouts/live_ST001'), out()))
    await assertSucceeds(setDoc(doc(anon(), 'clockouts/live_ST001'), out()))
    await assertFails(setDoc(doc(anon(), 'clockouts/live_ST001'), out({ token: 'WRONG1' })))
    await assertFails(setDoc(doc(anon(), 'clockouts/live_ST001'), out({ timestamp: Timestamp.fromMillis(Date.now() + 3600_000) })))
  })

  it('the owner can attach a staff list to a link that is already open; nobody else can', async () => {
    await assertSucceeds(updateDoc(doc(as('lecA'), 'sessionLinks/ABC234'), { rosterId: 'shift' }))
    await assertFails(updateDoc(doc(as('lecA2'), 'sessionLinks/ABC234'), { rosterId: 'other' }))
    await assertFails(updateDoc(doc(anon(), 'sessionLinks/ABC234'), { rosterId: 'other' }))
  })
})

describe('registered phones', () => {
  const reg = (db: ReturnType<typeof anon>, sessionId: string, key: string, device: string, extra = {}) => {
    const batch = writeBatch(db)
    batch.set(doc(db, `attendance/${sessionId}_${key}`), record(sessionId, key, { device, ...extra }))
    const body = { organisationId: 'orgA', staffKey: key, device, sessionId, listId: '', by: 'self', at: serverTimestamp() }
    batch.set(doc(db, `phones/orgA_${key}`), body)
    batch.set(doc(db, `devices/orgA_${device}`), body)
    return batch.commit()
  }
  beforeEach(() =>
    env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'sessions/liveB'), session('lecA', 'orgA', { status: 'active', token: 'ABC234', expiresAt: future, phoneCheck: 'block' })),
    ),
  )

  it('a first clock-in registers the phone; the same phone cannot be registered to someone else', async () => {
    await assertSucceeds(reg(anon(), 'live', 'ST010', 'PHONEAAAAAAAAAAA'))
    await assertFails(reg(anon(), 'live', 'ST011', 'PHONEAAAAAAAAAAA'))
    // In "flag" mode the check-in itself still goes through without registering.
    await assertSucceeds(setDoc(doc(anon(), 'attendance/live_ST011'), record('live', 'ST011', { device: 'PHONEAAAAAAAAAAA' })))
  })

  it('a phone cannot be registered without a check-in from it', async () => {
    const body = { organisationId: 'orgA', staffKey: 'ST020', device: 'PHONEBBBBBBBBBBB', sessionId: 'live', listId: '', by: 'self', at: serverTimestamp() }
    await assertFails(setDoc(doc(anon(), 'phones/orgA_ST020'), body))
  })

  it('where other phones are refused: own phone yes, another phone no, someone else’s phone no', async () => {
    await assertSucceeds(reg(anon(), 'liveB', 'ST030', 'PHONECCCCCCCCCCC'))
    await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), 'attendance/liveB_ST030')))
    await assertSucceeds(setDoc(doc(anon(), 'attendance/liveB_ST030'), record('liveB', 'ST030', { device: 'PHONECCCCCCCCCCC' })))
    await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), 'attendance/liveB_ST030')))
    await assertFails(setDoc(doc(anon(), 'attendance/liveB_ST030'), record('liveB', 'ST030', { device: 'PRIVATEWINDOW123' })))
    await assertFails(setDoc(doc(anon(), 'attendance/liveB_ST030'), record('liveB', 'ST030')))
    await assertFails(reg(anon(), 'liveB', 'ST031', 'PHONECCCCCCCCCCC'))
  })

  it('an admin, or the manager of the person’s own list, approves or resets a phone; nobody else', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'classes/shift'), { organisationId: 'orgA', ownerId: 'lecA', name: 'Shift' })
      await setDoc(doc(ctx.firestore(), 'rosters/shift/students/ST040'), { studentKey: 'ST040', studentId: 'ST040', studentName: 'A', organisationId: 'orgA', ownerId: 'lecA' })
    })
    await assertSucceeds(reg(anon(), 'live', 'ST040', 'PHONEDDDDDDDDDDD'))
    const body = (by: string, listId: string) => ({ organisationId: 'orgA', staffKey: 'ST040', device: 'PHONEEEEEEEEEEEE', sessionId: '', listId, by, at: serverTimestamp() })
    // Another manager in the company, whose list the person is not on: refused.
    await assertFails(setDoc(doc(as('lecA2'), 'phones/orgA_ST040'), body('lecA2', 'shift')))
    await assertFails(setDoc(doc(as('lecA2'), 'phones/orgA_ST040'), body('lecA2', '')))
    await assertFails(setDoc(doc(as('lecB'), 'phones/orgA_ST040'), body('lecB', 'shift')))
    await assertFails(setDoc(doc(anon(), 'phones/orgA_ST040'), body('self', 'shift')))
    // The person's own manager, and the admin: allowed.
    await assertSucceeds(setDoc(doc(as('lecA'), 'phones/orgA_ST040'), body('lecA', 'shift')))
    await assertSucceeds(setDoc(doc(as('adminA'), 'phones/orgA_ST040'), body('adminA', '')))
    await assertSucceeds(getDoc(doc(as('lecA'), 'phones/orgA_ST040')))
    await assertFails(getDoc(doc(anon(), 'phones/orgA_ST040')))
    await assertFails(getDoc(doc(as('adminB'), 'phones/orgA_ST040')))
    // Reset: only the admin now, because the admin's approval left no list on it.
    await assertFails(deleteDoc(doc(as('lecA2'), 'phones/orgA_ST040')))
    await assertSucceeds(deleteDoc(doc(as('adminA'), 'phones/orgA_ST040')))
  })

  it('an admin can edit any office and its staff list, and take an office back', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'classes/branch'), { organisationId: 'orgA', ownerId: 'lecA', ownerName: 'A', name: 'Branch', slots: [{ day: 1, startTime: '09:00', endTime: '17:00' }], days: [1] }),
    )
    await assertSucceeds(updateDoc(doc(as('adminA'), 'classes/branch'), { name: 'Branch office' }))
    await assertFails(updateDoc(doc(as('lecA2'), 'classes/branch'), { name: 'Mine' }))
    await assertSucceeds(setDoc(doc(as('adminA'), 'rosters/branch/students/E9'), { studentKey: 'E9', studentId: 'E9', studentName: 'B', organisationId: 'orgA', ownerId: 'lecA' }))
    await assertFails(setDoc(doc(as('adminA'), 'rosters/branch/students/E8'), { studentKey: 'E8', studentId: 'E8', studentName: 'C', organisationId: 'orgA', ownerId: 'adminA' }))
    await assertSucceeds(updateDoc(doc(as('adminA'), 'classes/branch'), { ownerId: 'adminA', ownerName: 'Admin' }))
    await assertFails(updateDoc(doc(as('adminB'), 'classes/branch'), { ownerId: 'adminB', ownerName: 'B' }))
  })
})

describe('clearing a phone flag', () => {
  it('the manager can mark a record as checked; nobody else, and nothing else changes with it', async () => {
    await assertSucceeds(updateDoc(doc(as('lecA'), 'attendance/live_ST001'), { phoneChecked: true }))
    await assertFails(updateDoc(doc(as('lecA'), 'attendance/live_ST001'), { phoneChecked: 'yes' }))
    await assertFails(updateDoc(doc(as('lecA2'), 'attendance/live_ST001'), { phoneChecked: true }))
    await assertFails(updateDoc(doc(anon(), 'attendance/live_ST001'), { phoneChecked: true }))
    await assertFails(updateDoc(doc(as('lecA'), 'attendance/live_ST001'), { phoneChecked: true, studentName: 'Other' }))
  })
})

describe('early leave and half days', () => {
  it('the manager may allow an early leave or set a half day, with known values only', async () => {
    await assertSucceeds(updateDoc(doc(as('lecA'), 'attendance/live_ST001'), { earlyOk: 'clinic' }))
    await assertSucceeds(updateDoc(doc(as('lecA'), 'attendance/live_ST001'), { halfDay: 'pm' }))
    await assertFails(updateDoc(doc(as('lecA'), 'attendance/live_ST001'), { earlyOk: 'holiday' }))
    await assertFails(updateDoc(doc(as('lecA'), 'attendance/live_ST001'), { halfDay: 'noon' }))
    await assertFails(updateDoc(doc(anon(), 'attendance/live_ST001'), { earlyOk: 'clinic' }))
    await assertFails(updateDoc(doc(as('lecA2'), 'attendance/live_ST001'), { halfDay: 'am' }))
  })
})

describe('the owner of Attend', () => {
  beforeEach(() =>
    env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'platformOwners/boss'), { name: 'Owner' })
      await setDoc(doc(ctx.firestore(), 'users/boss'), user('admin', 'orgZ'))
    }),
  )

  it('sees every customer, their people and their activity, but not attendance', async () => {
    await assertSucceeds(getDocs(collection(as('boss'), 'organisations')))
    await assertSucceeds(getDocs(collection(as('boss'), 'users')))
    await assertSucceeds(getDocs(collection(as('boss'), 'sessions')))
    await assertSucceeds(getDocs(collection(as('boss'), 'classes')))
    await assertFails(getDocs(query(collection(as('boss'), 'attendance'), where('organisationId', '==', 'orgA'))))
  })

  it('changes a plan, trial, seats and suspension, and nothing else', async () => {
    await assertSucceeds(updateDoc(doc(as('boss'), 'organisations/orgA'), { plan: 'pro', paidUntil: future, seats: 50, suspended: false, ownerNote: 'Paid by transfer' }))
    await assertSucceeds(updateDoc(doc(as('boss'), 'organisations/orgA'), { plan: 'trial', trialStarted: Timestamp.now() }))
    await assertFails(updateDoc(doc(as('boss'), 'organisations/orgA'), { name: 'Hijacked' }))
    await assertFails(updateDoc(doc(as('boss'), 'organisations/orgA'), { plan: 'gold' }))
    await assertFails(updateDoc(doc(as('boss'), 'organisations/orgA'), { seats: -1 }))
  })

  it('is the only one who can, and nobody can make themselves an owner', async () => {
    await assertFails(getDocs(collection(as('adminA'), 'organisations')))
    await assertFails(updateDoc(doc(as('adminA'), 'organisations/orgA'), { plan: 'pro', paidUntil: future }))
    await assertFails(updateDoc(doc(as('adminA'), 'organisations/orgA'), { suspended: false }))
    await assertFails(setDoc(doc(as('adminA'), 'platformOwners/adminA'), { name: 'Me' }))
    await assertSucceeds(getDoc(doc(as('boss'), 'platformOwners/boss')))
    await assertFails(getDoc(doc(as('adminA'), 'platformOwners/boss')))
  })

  it('keeps an append-only book of payments and changes', async () => {
    const entry = { organisationId: 'orgA', kind: 'payment', amount: 99, note: 'DuitNow ref 123', by: 'boss', at: serverTimestamp() }
    await assertSucceeds(setDoc(doc(as('boss'), 'billing/e1'), entry))
    await assertFails(setDoc(doc(as('boss'), 'billing/e2'), { ...entry, by: 'someoneElse' }))
    await assertFails(setDoc(doc(as('adminA'), 'billing/e3'), { ...entry, by: 'adminA' }))
    await assertFails(updateDoc(doc(as('boss'), 'billing/e1'), { amount: 9 }))
    await assertFails(deleteDoc(doc(as('boss'), 'billing/e1')))
    await assertFails(getDocs(collection(as('adminA'), 'billing')))
  })
})

describe("Attend's back-office team and roles", () => {
  beforeEach(() =>
    env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'platformOwners/boss'), { email: 'boss@attend.my' })
      for (const role of ['admin', 'finance', 'support', 'viewer']) await setDoc(doc(db, `platformOwners/${role}1`), { email: `${role}@attend.my`, role })
      await setDoc(doc(db, 'invoices/inv1'), { number: 'INV-1', organisationId: 'orgA', status: 'unpaid', total: 99, by: 'boss' })
      await setDoc(doc(db, 'platformConfig/counters'), { invoice: 7 })
    }),
  )
  const staff = (uid: string, verified = false) => env.authenticatedContext(uid, { email: `${uid}@attend.my`, email_verified: verified }).firestore()

  it('lets finance handle money but not suspend; support handle trials and tags but not money; viewers only look', async () => {
    await assertSucceeds(updateDoc(doc(staff('finance1'), 'organisations/orgA'), { plan: 'pro', paidUntil: future, price: { amount: 99, currency: 'MYR', cycle: 'month' } }))
    await assertFails(updateDoc(doc(staff('finance1'), 'organisations/orgA'), { suspended: true }))
    await assertSucceeds(updateDoc(doc(staff('support1'), 'organisations/orgA'), { trialStarted: Timestamp.now(), tags: ['school'], accountManager: 'support1' }))
    await assertFails(updateDoc(doc(staff('support1'), 'organisations/orgA'), { plan: 'free' }))
    await assertFails(updateDoc(doc(staff('support1'), 'organisations/orgA'), { price: { amount: 1, currency: 'MYR', cycle: 'month' } }))
    await assertSucceeds(updateDoc(doc(staff('admin1'), 'organisations/orgA'), { suspended: true }))
    await assertFails(updateDoc(doc(staff('viewer1'), 'organisations/orgA'), { tags: ['x'] }))
    await assertSucceeds(getDocs(collection(staff('viewer1'), 'organisations')))
    await assertFails(updateDoc(doc(staff('finance1'), 'organisations/orgA'), { price: { amount: 9, currency: 'EUR', cycle: 'month' } }))
  })

  it('numbers invoices in order, never deletes them, and only voids or pays an unpaid one', async () => {
    await assertSucceeds(updateDoc(doc(staff('finance1'), 'platformConfig/counters'), { invoice: 8 }))
    await assertFails(updateDoc(doc(staff('finance1'), 'platformConfig/counters'), { invoice: 20 }))
    await assertSucceeds(setDoc(doc(staff('finance1'), 'invoices/inv2'), { number: 'INV-2', organisationId: 'orgA', status: 'unpaid', total: 50, by: 'finance1' }))
    await assertFails(setDoc(doc(staff('support1'), 'invoices/inv3'), { number: 'INV-3', organisationId: 'orgA', status: 'unpaid', total: 50, by: 'support1' }))
    await assertFails(updateDoc(doc(staff('finance1'), 'invoices/inv1'), { total: 1 }))
    await assertSucceeds(updateDoc(doc(staff('finance1'), 'invoices/inv1'), { status: 'void', voidReason: 'Wrong amount' }))
    await assertFails(updateDoc(doc(staff('finance1'), 'invoices/inv1'), { status: 'paid' }))
    await assertFails(deleteDoc(doc(staff('boss'), 'invoices/inv1')))
  })

  it('keeps the audit log and customer notes as written', async () => {
    await assertSucceeds(setDoc(doc(staff('support1'), 'platformAudit/a1'), { actor: 'support1', action: 'note', detail: 'x', at: serverTimestamp() }))
    await assertFails(setDoc(doc(staff('support1'), 'platformAudit/a2'), { actor: 'boss', action: 'note', at: serverTimestamp() }))
    await assertFails(updateDoc(doc(staff('boss'), 'platformAudit/a1'), { detail: 'changed' }))
    await assertFails(getDocs(collection(staff('support1'), 'platformAudit')))
    await assertSucceeds(getDocs(collection(staff('admin1'), 'platformAudit')))
    await assertSucceeds(setDoc(doc(staff('support1'), 'customerNotes/n1'), { organisationId: 'orgA', text: 'Called the boss', by: 'support1', at: serverTimestamp() }))
    await assertFails(deleteDoc(doc(staff('boss'), 'customerNotes/n1')))
    await assertFails(setDoc(doc(staff('viewer1'), 'customerNotes/n2'), { organisationId: 'orgA', text: 'x', by: 'viewer1', at: serverTimestamp() }))
  })

  it('lets owners build the team, and an invited person join with a verified email', async () => {
    await assertSucceeds(setDoc(doc(staff('boss'), 'platformInvites/newbie@attend.my'), { role: 'support', invitedBy: 'boss' }))
    await assertFails(setDoc(doc(staff('admin1'), 'platformInvites/x@attend.my'), { role: 'owner' }))
    await assertFails(setDoc(doc(staff('newbie'), 'platformOwners/newbie'), { email: 'newbie@attend.my', role: 'support' }))
    await assertFails(setDoc(doc(staff('newbie', true), 'platformOwners/newbie'), { email: 'newbie@attend.my', role: 'owner' }))
    await assertSucceeds(setDoc(doc(staff('newbie', true), 'platformOwners/newbie'), { email: 'newbie@attend.my', role: 'support' }))
    await assertSucceeds(updateDoc(doc(staff('boss'), 'platformOwners/finance1'), { role: 'admin' }))
    await assertFails(updateDoc(doc(staff('boss'), 'platformOwners/boss'), { role: 'viewer' }))
    await assertFails(deleteDoc(doc(staff('boss'), 'platformOwners/boss')))
    await assertFails(updateDoc(doc(staff('admin1'), 'platformOwners/viewer1'), { role: 'owner' }))
  })

  it('shows announcements to customers but lets only admins write them, and lets admins switch users off', async () => {
    const a = { title: 'Maintenance', body: 'Sunday 2am', level: 'info', audience: 'all', active: true }
    await assertSucceeds(setDoc(doc(staff('admin1'), 'announcements/a1'), a))
    await assertFails(setDoc(doc(staff('support1'), 'announcements/a2'), a))
    await assertSucceeds(getDoc(doc(as('lecA'), 'announcements/a1')))
    await assertSucceeds(updateDoc(doc(staff('admin1'), 'users/lecA'), { status: 'disabled' }))
    await assertFails(updateDoc(doc(staff('support1'), 'users/lecA'), { status: 'disabled' }))
    await assertFails(updateDoc(doc(staff('admin1'), 'users/lecA'), { role: 'admin' }))
  })
})
