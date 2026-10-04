// Fills the LOCAL EMULATOR with a realistic month for a workplace: two offices, ~22 staff,
// September 2026 plus the first days of October. Never touches a real project.
// Usage: node scripts/seed-workplace.mjs <organisationId> <ownerUid> <ownerName> <hqClassId> <branchClassId>
//
// What is in it, so the reports can be checked against it:
// - HQ Kuala Lumpur: Mon–Fri 09:00–18:00, 1 h unpaid lunch. Penang branch: Mon–Fri 09:00–18:00, Sat 09:00–13:00.
// - 16 Sep (Malaysia Day) is a public holiday at both offices; two HQ operations staff work it.
// - Sat 19 Sep: HQ stock-take, four people come in (rest-day work).
// - Leave (annual, emergency, unpaid), MC, half days, allowed early leave, people who are often late,
//   people who forget to clock out, a few days absent without leave, overtime in operations.
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { Timestamp, doc, writeBatch } from 'firebase/firestore'

const [org, owner, ownerName = 'Manager', hq, branch] = process.argv.slice(2)
if (!org || !owner || !hq || !branch) throw new Error('Usage: node scripts/seed-workplace.mjs <organisationId> <ownerUid> <ownerName> <hqClassId> <branchClassId>')

const env = await initializeTestEnvironment({ projectId: 'demo-attendance', firestore: { host: '127.0.0.1', port: 8080 } })

// A fixed random sequence, so every run gives the same month.
let seed = 20260901
const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
const between = (a, b) => a + rand() * (b - a)
const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// Each person: office, department, and habits. late = chance of being late on a day;
// forget = chance of not clocking out; ot = chance of staying late (overtime).
const P = (studentKey, studentName, department, habits = {}) => ({ studentKey, studentId: studentKey, studentName, department, late: 0.04, lateBy: [11, 25], forget: 0.01, ot: 0.05, ...habits })
const HQ_STAFF = [
  P('E001', 'Ahmad bin Ali', 'Sales', { ot: 0.15 }),
  P('E002', 'Siti Aminah', 'Sales', { late: 0.35, lateBy: [12, 45] }),
  P('E003', 'Kumar Raj', 'Accounts'),
  P('E004', 'Lim Wei Ling', 'Accounts'),
  P('E005', 'Nurul Huda', 'Sales', { forget: 0.06 }),
  P('E006', 'Tan Mei Ling', 'Sales'),
  P('E007', 'Raju Kumar', 'Operations', { late: 0.12, forget: 0.05 }),
  P('E008', 'Farah Idris', 'Human Resources'),
  P('E009', 'Daniel Lim', 'Operations', { ot: 0.45 }),
  P('E010', 'Aisyah Rahman', 'Sales'),
  P('E011', 'Muthu a/l Samy', 'Operations', { late: 0.18, ot: 0.3 }),
  P('E012', 'Chong Kai Xin', 'Accounts', { ot: 0.12 }),
  P('E013', 'Haziq Zulkifli', 'Operations', { forget: 0.12, ot: 0.25 }),
  P('E014', "Nur'ain Hassan", 'Human Resources'),
  P('E015', 'Lee Wei Jie', 'Sales', { late: 0.1 }),
  P('E016', 'Priya Devi', 'Accounts'),
]
const BRANCH_STAFF = [
  P('P001', 'Ong Kah Seng', 'Operations', { late: 0.15 }),
  P('P002', 'Mohd Firdaus', 'Operations', { ot: 0.2 }),
  P('P003', 'Goh Siew Lan', 'Sales'),
  P('P004', 'Saravanan a/l Muniandy', 'Operations', { late: 0.08, forget: 0.04 }),
  P('P005', 'Nurul Izzati', 'Sales'),
  P('P006', 'Wong Jun Hao', 'Operations', { ot: 0.2 }),
]

// Days off and special days, by person and date.
const LEAVE = {
  E003: { '2026-09-08': 'annual', '2026-09-09': 'annual', '2026-09-10': 'annual' },
  E006: { '2026-09-22': 'mc', '2026-09-23': 'mc' },
  E011: { '2026-09-14': 'emergency' },
  E014: { '2026-09-28': 'annual', '2026-09-29': 'annual' },
  E016: { '2026-09-04': 'mc' },
  E010: { '2026-09-25': 'unpaid' },
  P003: { '2026-09-11': 'annual' },
  P005: { '2026-09-17': 'mc' },
}
const ABSENT = { E007: ['2026-09-07', '2026-09-21'], P001: ['2026-09-24'], E015: ['2026-09-30'] }
const HALF = { E004: { '2026-09-15': 'am', '2026-09-24': 'pm' }, E012: { '2026-09-18': 'pm' } }
const EARLY = { E010: { '2026-09-03': 'clinic', '2026-09-17': null }, E002: { '2026-09-29': 'personal' } }

const HOLIDAY = '2026-09-16'
const FROM = '2026-09-01'
const TO = '2026-10-03'

const offices = [
  { classId: hq, name: 'HQ Kuala Lumpur', staff: HQ_STAFF, days: { 1: ['09:00', '18:00'], 2: ['09:00', '18:00'], 3: ['09:00', '18:00'], 4: ['09:00', '18:00'], 5: ['09:00', '18:00'] } },
  { classId: branch, name: 'Penang branch', staff: BRANCH_STAFF, days: { 1: ['09:00', '18:00'], 2: ['09:00', '18:00'], 3: ['09:00', '18:00'], 4: ['09:00', '18:00'], 5: ['09:00', '18:00'], 6: ['09:00', '13:00'] } },
]

const counts = { sessions: 0, records: 0, clockouts: 0, leave: 0 }

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore()
  const base = { organisationId: org, ownerId: owner }

  for (const o of offices) {
    // The working hours themselves: days, times, break, the public holiday.
    let batch = writeBatch(db)
    const slots = Object.entries(o.days).map(([day, [startTime, endTime]]) => ({ day: Number(day), startTime, endTime }))
    batch.set(
      doc(db, 'classes', o.classId),
      { slots, days: slots.map((s) => s.day), startTime: '09:00', endTime: '18:00', breakMin: 60, graceMin: 10, startDate: '2026-08-01', rosterCount: o.staff.length, cancelled: { [`${HOLIDAY}_0900`]: 'Malaysia Day' } },
      { merge: true },
    )
    for (const s of o.staff) {
      const { late, lateBy, forget, ot, ...entry } = s
      batch.set(doc(db, 'rosters', o.classId, 'students', s.studentKey), { ...entry, ...base })
    }
    await batch.commit()

    // Normal days, plus the HQ holiday shift and Saturday stock-take.
    const days = []
    for (let d = new Date(`${FROM}T00:00:00`); iso(d) <= TO; d.setDate(d.getDate() + 1)) {
      const date = iso(d)
      const hours = o.days[d.getDay()]
      if (hours && date !== HOLIDAY) days.push({ date, start: hours[0], end: hours[1], people: o.staff })
    }
    if (o.classId === hq) {
      days.push({ date: HOLIDAY, start: '09:00', end: '18:00', people: o.staff.filter((s) => ['E009', 'E013'].includes(s.studentKey)), only: true })
      days.push({ date: '2026-09-19', start: '09:00', end: '14:00', people: o.staff.filter((s) => ['E009', 'E011', 'E013', 'E001'].includes(s.studentKey)), only: true })
    }

    for (const day of days) {
      const [y, m, dd] = day.date.split('-').map(Number)
      const at = (time, plusMin = 0) => {
        const [h, mi] = time.split(':').map(Number)
        return Timestamp.fromDate(new Date(y, m - 1, dd, h, mi + Math.round(plusMin), Math.floor(rand() * 60)))
      }
      const sessionId = `${o.classId}_${day.date}_${day.start.replace(':', '')}`
      batch = writeBatch(db)
      let present = 0
      const long = day.end !== '13:00' && day.end !== '14:00'
      for (const s of day.people) {
        const key = s.studentKey
        const leave = LEAVE[key]?.[day.date]
        const ref = doc(db, 'attendance', `${sessionId}_${key}`)
        const who = { studentKey: key, studentId: s.studentId, studentName: s.studentName }
        const common = { ...base, sessionId, sessionName: o.name, date: day.date, token: 'SEED00', ...who }
        if (!day.only && ABSENT[key]?.includes(day.date)) continue
        if (!day.only && leave) {
          batch.set(ref, { ...common, status: leave === 'mc' ? 'mc' : 'excused', method: 'manual', timestamp: at(day.start, 30) })
          if (leave !== 'mc') {
            batch.set(doc(db, 'evidence', `${sessionId}_${key}`), { ...base, sessionId, studentKey: key, leaveType: leave, remarks: `${leave[0].toUpperCase()}${leave.slice(1)} leave`, mcNumber: '', clinic: '', updatedBy: owner, updatedAt: at(day.start, 30) })
            counts.leave++
          } else {
            batch.set(doc(db, 'evidence', `${sessionId}_${key}`), { ...base, sessionId, studentKey: key, mcNumber: `MC${Math.floor(between(10000, 99999))}`, clinic: 'Klinik Mediviron', remarks: '', updatedBy: owner, updatedAt: at(day.start, 30) })
          }
          counts.records++
          continue
        }
        const half = HALF[key]?.[day.date]
        // Clock-in: early birds 08:35–08:59, sometimes just on time, sometimes late.
        const isLate = !half && rand() < s.late
        // A morning off comes in after lunch.
        const inMin = half === 'am' ? between(292, 305) : isLate ? between(s.lateBy[0], s.lateBy[1]) : between(-25, 4)
        const record = { ...common, status: 'present', method: 'qr', device: `DEV-${key}`, timestamp: at(day.start, inMin) }
        if (half) record.halfDay = half
        const early = EARLY[key] && day.date in EARLY[key]
        if (early && EARLY[key][day.date]) record.earlyOk = EARLY[key][day.date]
        batch.set(ref, record)
        present++
        counts.records++
        // Clock-out: usually 0–20 min after the end; overtime some days; early leavers; forgetters.
        if (rand() < s.forget) continue
        let outMin = between(0, 20)
        if (half === 'pm') outMin = -between(270, 285)
        else if (early) outMin = -between(60, 150)
        else if (long && rand() < s.ot) outMin = between(60, 180)
        batch.set(doc(db, 'clockouts', `${sessionId}_${key}`), { ...base, sessionId, studentKey: key, by: 'self', token: 'SEED00', timestamp: at(day.end, outMin) })
        counts.clockouts++
      }
      batch.set(doc(db, 'sessions', sessionId), {
        ...base, ownerName, name: o.name, description: '', code: '', section: '', venue: o.name, delivery: 'in_person', kind: 'lecture', meetingUrl: '',
        geoPoint: null, geoRadius: null, geoCos: null, geoMode: null, graceMin: 10, breakMin: 60, mode: 'qr', classId: o.classId, rosterId: o.classId,
        date: day.date, startTime: day.start, endTime: day.end, expected: day.only ? day.people.length : o.staff.length, presentCount: present,
        status: 'ended', token: 'SEED00', qrCode: null, qrCodePrev: null, checkpoint: null,
        createdAt: at(day.start, -30), startedAt: at(day.start, -30), endedAt: at(day.end, 240), expiresAt: at(day.end, 240),
      })
      await batch.commit()
      counts.sessions++
    }
  }
})
await env.cleanup()
console.log('Seeded', counts)
