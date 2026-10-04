// Adds two more workplaces to a company in the LOCAL EMULATOR, to check the reports on shift work
// and flexible hours. Never touches a real project.
// Usage: node scripts/seed-shifts.mjs <organisationId> <ownerUid> <ownerName>
//
// - Kilang Shah Alam: 12 people rotating weekly between three shifts (A 07–15, B 15–23, C 23–07),
//   each on six days a week, with a Shift plan for every week of September 2026.
//   Built in: two no-shows on planned days, one MC, one person on the wrong shift, one missing
//   clock-out, some lateness.
// - Studio KL: 4 people on flexible hours, Mon–Fri, arriving any time between 08:00 and 11:00.
// It prints what the September report should show for each, worked out while generating.
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { Timestamp, doc, writeBatch } from 'firebase/firestore'

const [org, owner, ownerName = 'Manager'] = process.argv.slice(2)
if (!org || !owner) throw new Error('Usage: node scripts/seed-shifts.mjs <organisationId> <ownerUid> <ownerName>')
const env = await initializeTestEnvironment({ projectId: 'demo-attendance', firestore: { host: '127.0.0.1', port: 8080 } })

let seed = 777
const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const ts = (date, time, plusMin = 0) => {
  const [y, m, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  return Timestamp.fromDate(new Date(y, m - 1, d, h, mi + Math.round(plusMin), Math.floor(rand() * 60)))
}
const minutesBetween = (a, b) => (b.toMillis() - a.toMillis()) / 60_000

const SHIFTS = [
  { id: 'kilang-a', name: 'Shift A (morning)', start: '07:00', end: '15:00' },
  { id: 'kilang-b', name: 'Shift B (afternoon)', start: '15:00', end: '23:00' },
  { id: 'kilang-c', name: 'Shift C (night)', start: '23:00', end: '07:00' },
]
const LIST = 'kilang-a'
const FACTORY = ['Azman', 'Bala', 'Chandran', 'Dewi', 'Ehsan', 'Faizal', 'Gopal', 'Hafiz', 'Intan', 'Jaya', 'Kamal', 'Latifah'].map((n, i) => ({
  studentKey: `F${pad(i + 1)}0`, studentId: `F${pad(i + 1)}0`, studentName: n, department: i < 9 ? 'Production' : 'Quality',
}))
const STUDIO = ['Mei Xin', 'Arjun', 'Sofia', 'Danish'].map((n, i) => ({ studentKey: `S00${i + 1}`, studentId: `S00${i + 1}`, studentName: n, department: 'Design' }))

const NO_SHOW = { [`${FACTORY[2].studentKey}|2026-09-09`]: true, [`${FACTORY[9].studentKey}|2026-09-22`]: true }
const MC = { [`${FACTORY[5].studentKey}|2026-09-15`]: true }
const WRONG = { [`${FACTORY[6].studentKey}|2026-09-17`]: true }
const FORGET = { [`${FACTORY[3].studentKey}|2026-09-24`]: true }

const expectFactory = { planned: 0, worked: 0, absent: 0, mc: 0, wrongShift: 0, noClockOut: 0, late: 0, nights: 0 }
const expectStudio = { days: 0, late: 0, minutes: 0, overtime: 0 }

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore()
  const base = { organisationId: org, ownerId: owner }
  const common = { ...base, ownerName, description: '', code: '', section: '', delivery: 'in_person', kind: 'lecture', meetingUrl: '', geoPoint: null, geoRadius: null, geoCos: null, geoMode: null, createdAt: Timestamp.now() }
  const every = [0, 1, 2, 3, 4, 5, 6]

  // The three shifts and their one shared list.
  let batch = writeBatch(db)
  for (const s of SHIFTS) {
    batch.set(doc(db, 'classes', s.id), {
      ...common, name: s.name, venue: 'Kilang Shah Alam', days: every, slots: every.map((day) => ({ day, startTime: s.start, endTime: s.end })), startTime: s.start, endTime: s.end,
      startDate: '2026-08-31', endDate: '2027-12-31', expected: null, graceMin: 10, breakMin: 60, flexible: false, rotating: true,
      rosterFrom: s.id === LIST ? null : LIST, daysPerWeek: s.id === LIST ? 6 : null, minStaff: 3, rosterCount: s.id === LIST ? FACTORY.length : 0, cancelled: {},
    })
  }
  for (const p of FACTORY) batch.set(doc(db, 'rosters', LIST, 'students', p.studentKey), { ...p, ...base })
  batch.set(doc(db, 'classes', 'studio-kl'), {
    ...common, name: 'Studio KL', venue: 'Studio KL', days: [1, 2, 3, 4, 5], slots: [1, 2, 3, 4, 5].map((day) => ({ day, startTime: '09:00', endTime: '18:00' })), startTime: '09:00', endTime: '18:00',
    startDate: '2026-09-01', endDate: '2027-12-31', expected: null, graceMin: null, breakMin: 60, flexible: true, rotating: false, rosterFrom: null, daysPerWeek: null, minStaff: null,
    rosterCount: STUDIO.length, cancelled: { '2026-09-16_0900': 'Malaysia Day' },
  })
  for (const p of STUDIO) batch.set(doc(db, 'rosters', 'studio-kl', 'students', p.studentKey), { ...p, ...base })
  await batch.commit()

  // A Shift plan for each week: three crews of four move to the next shift every Monday; each
  // person has one fixed day off.
  const plan = new Map()
  for (const monday of ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']) {
    const w = ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'].indexOf(monday)
    const cells = {}
    FACTORY.forEach((p, i) => {
      const shift = SHIFTS[(Math.floor(i / 4) + w) % 3].id
      cells[p.studentKey] = {}
      for (let k = 0; k < 7; k++) {
        const d = new Date(`${monday}T00:00:00`)
        d.setDate(d.getDate() + k)
        cells[p.studentKey][iso(d)] = k === i % 7 ? 'off' : shift
        plan.set(`${p.studentKey}|${iso(d)}`, k === i % 7 ? 'off' : shift)
      }
    })
    await writeBatch(db).set(doc(db, 'plans', `${LIST}_${monday}`), { ...base, rosterId: LIST, week: monday, cells, updatedAt: Timestamp.now() }).commit()
  }

  for (let day = new Date('2026-09-01T00:00:00'); iso(day) <= '2026-09-30'; day.setDate(day.getDate() + 1)) {
    const date = iso(day)
    batch = writeBatch(db)
    for (const s of SHIFTS) {
      const sid = `${s.id}_${date}_${s.start.replace(':', '')}`
      const crew = FACTORY.filter((p) => plan.get(`${p.studentKey}|${date}`) === s.id)
      let present = 0
      for (const p of crew) {
        const key = `${p.studentKey}|${date}`
        expectFactory.planned++
        if (NO_SHOW[key]) { expectFactory.absent++; continue }
        if (MC[key]) {
          const { department: _d, ...person } = p
          batch.set(doc(db, 'attendance', `${sid}_${p.studentKey}`), { ...base, sessionId: sid, sessionName: s.name, date, token: 'SEED00', ...person, status: 'mc', method: 'manual', timestamp: ts(date, s.start, 60) })
          expectFactory.mc++
          continue
        }
        // On the wrong shift: clocks in to the next shift instead of the planned one.
        const on = WRONG[key] ? SHIFTS[(SHIFTS.indexOf(s) + 1) % 3] : s
        const onId = `${on.id}_${date}_${on.start.replace(':', '')}`
        if (WRONG[key]) expectFactory.wrongShift++
        const late = rand() < 0.06
        const tin = ts(date, on.start, late ? 12 + rand() * 18 : -15 + rand() * 14)
        if (late) expectFactory.late++
        if (on.id === 'kilang-c') expectFactory.nights++
        const { department, ...who } = p
        batch.set(doc(db, 'attendance', `${onId}_${p.studentKey}`), { ...base, sessionId: onId, sessionName: on.name, date, token: 'SEED00', ...who, status: 'present', method: 'qr', device: `DEV-${p.studentKey}`, timestamp: tin })
        expectFactory.worked++
        if (on === s) present++
        if (FORGET[key]) { expectFactory.noClockOut++; continue }
        const endDate = on.end < on.start ? iso(new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) : date
        batch.set(doc(db, 'clockouts', `${onId}_${p.studentKey}`), { ...base, sessionId: onId, studentKey: p.studentKey, by: 'self', token: 'SEED00', timestamp: ts(endDate, on.end, rand() * 15) })
      }
      const endDay = s.end < s.start ? iso(new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) : date
      batch.set(doc(db, 'sessions', sid), {
        ...common, name: s.name, venue: 'Kilang Shah Alam', graceMin: 10, breakMin: 60, rotating: true, mode: 'qr', classId: s.id, rosterId: LIST, date, startTime: s.start, endTime: s.end,
        expected: crew.length, presentCount: present, status: 'ended', token: 'SEED00', qrCode: null, qrCodePrev: null, checkpoint: null,
        startedAt: ts(date, s.start, -30), endedAt: ts(endDay, s.end, 120), expiresAt: ts(endDay, s.end, 120),
      })
    }

    // Studio KL, flexible hours, weekdays except the holiday.
    if ([1, 2, 3, 4, 5].includes(day.getDay()) && date !== '2026-09-16') {
      const sid = `studio-kl_${date}_0900`
      for (const p of STUDIO) {
        const { department, ...who } = p
        const tin = ts(date, '08:00', rand() * 180)
        // A 9 h 15 min to 10 h 15 min day: 8 h 15 min to 9 h 15 min after the hour's lunch.
        const tout = Timestamp.fromMillis(tin.toMillis() + (555 + rand() * 60) * 60_000)
        batch.set(doc(db, 'attendance', `${sid}_${p.studentKey}`), { ...base, sessionId: sid, sessionName: 'Studio KL', date, token: 'SEED00', ...who, status: 'present', method: 'qr', device: `DEV-${p.studentKey}`, timestamp: tin })
        batch.set(doc(db, 'clockouts', `${sid}_${p.studentKey}`), { ...base, sessionId: sid, studentKey: p.studentKey, by: 'self', token: 'SEED00', timestamp: tout })
        const worked = minutesBetween(tin, tout) - 60
        expectStudio.days++
        expectStudio.minutes += worked
        expectStudio.overtime += Math.max(0, worked - 480)
      }
      batch.set(doc(db, 'sessions', sid), {
        ...common, name: 'Studio KL', venue: 'Studio KL', graceMin: null, flexible: true, breakMin: 60, mode: 'qr', classId: 'studio-kl', rosterId: 'studio-kl', date, startTime: '09:00', endTime: '18:00',
        expected: STUDIO.length, presentCount: STUDIO.length, status: 'ended', token: 'SEED00', qrCode: null, qrCodePrev: null, checkpoint: null,
        startedAt: ts(date, '07:45'), endedAt: ts(date, '21:30'), expiresAt: ts(date, '21:30'),
      })
    }
    await batch.commit()
  }
})
await env.cleanup()
const hm = (m) => `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')} min`
console.log('Kilang Shah Alam, September:', expectFactory)
console.log('Studio KL, September:', { ...expectStudio, minutes: hm(expectStudio.minutes), overtime: hm(expectStudio.overtime) })
