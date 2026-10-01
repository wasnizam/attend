// Fills the LOCAL EMULATOR with a sample class and eight weeks of attendance, so the
// report screens have something to show. Never touches a real project.
// Usage: node scripts/seed-demo.mjs <uid> <organisationId> <lecturerName>
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { Timestamp, doc, writeBatch } from 'firebase/firestore'

const [uid, org, name = 'Lecturer'] = process.argv.slice(2)
if (!uid || !org) throw new Error('Usage: node scripts/seed-demo.mjs <uid> <organisationId> <lecturerName>')

const env = await initializeTestEnvironment({ projectId: 'demo-attendance', firestore: { host: '127.0.0.1', port: 8080 } })
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const students = ['AHMAD BIN ALI', 'SITI AMINAH BINTI YUSOF', 'KUMAR A/L RAJAN', 'TAN MEI LING', "NUR'AIN BT. HASSAN", 'DANIEL LIM', 'FARAH IDRIS', 'LEE WEI JIE', 'AISYAH RAHMAN', 'MUTHU A/L SAMY', 'CHONG KAI XIN', 'HAZIQ ZULKIFLI']
  .map((studentName, i) => ({ studentKey: `A21CS${String(100 + i).padStart(4, '0')}`, studentId: `A21CS${String(100 + i).padStart(4, '0')}`, studentName }))
// How often each student turns up: most are regular, three are not.
const reliability = [1, 1, 0.95, 0.9, 1, 0.55, 0.9, 1, 0.75, 0.3, 1, 0.9]

// Two classes of one subject, so the subject report has something to compare:
// the lecture (everyone) and a tutorial group (the first eight students).
const variants = [
  { classId: 'demo-data-structures', name: 'Data Structures', kind: 'lecture', dayShift: 0, time: '09:00', end: '11:00', people: students, weeks: 8 },
  { classId: 'demo-data-structures-tut', name: 'Data Structures Tutorial', kind: 'tutorial', dayShift: 1, time: '14:00', end: '15:00', people: students.slice(0, 8), weeks: 6 },
]

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore()
  const today = new Date()
  const base = { organisationId: org, ownerId: uid }
  let seed = 7
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)

  for (const v of variants) {
    const anchor = new Date(today); anchor.setDate(anchor.getDate() - v.dayShift)
    const start = new Date(anchor); start.setDate(start.getDate() - 7 * 8)
    const end = new Date(start); end.setDate(end.getDate() + 7 * 14 - 1)
    const weekday = anchor.getDay()
    const [hh, mm] = v.time.split(':').map(Number)
    const details = { name: v.name, description: '', code: 'SECJ2013', section: '03', venue: 'N28 BK2', delivery: 'in_person', meetingUrl: '', kind: v.kind }
    let batch = writeBatch(db)
    batch.set(doc(db, 'classes', v.classId), {
      ...base, ownerName: name, ...details, slots: [{ day: weekday, startTime: v.time, endTime: v.end }], days: [weekday],
      startTime: v.time, endTime: v.end, startDate: iso(start), endDate: iso(end), expected: null, rosterCount: v.people.length,
      createdAt: Timestamp.now(),
    })
    for (const s of v.people) batch.set(doc(db, 'rosters', v.classId, 'students', s.studentKey), { ...s, ...base })
    await batch.commit()

    for (let w = v.weeks; w >= 1; w--) {
      const day = new Date(anchor); day.setDate(day.getDate() - 7 * w)
      const date = iso(day)
      const sessionId = `${v.classId}_${date}_${v.time.replace(':', '')}`
      const at = (min) => Timestamp.fromDate(new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm + min))
      batch = writeBatch(db)
      let present = 0
      v.people.forEach((s) => {
        const i = students.indexOf(s)
        // Tutorials are attended a little worse than lectures.
        if (rand() > reliability[i] - (v.kind === 'tutorial' ? 0.12 : 0)) return
        const late = rand() < 0.12
        const excused = !late && rand() < 0.04
        if (!excused) present++
        batch.set(doc(db, 'attendance', `${sessionId}_${s.studentKey}`), {
          ...base, sessionId, sessionName: v.name, date, ...s, token: 'DEMO00',
          timestamp: at(late ? 20 + Math.floor(rand() * 15) : Math.floor(rand() * 10)),
          status: excused ? 'excused' : late ? 'late' : 'present', method: excused ? 'manual' : 'qr',
        })
      })
      batch.set(doc(db, 'sessions', sessionId), {
        ...base, ownerName: name, ...details, date, startTime: v.time, endTime: v.end,
        expected: v.people.length, mode: 'qr', classId: v.classId, rosterId: v.classId, status: 'ended', token: 'DEMO00',
        presentCount: present, createdAt: at(0), startedAt: at(0), endedAt: at(60), expiresAt: at(60),
      })
      await batch.commit()
    }
  }
})
await env.cleanup()
console.log('Seeded: Data Structures lecture (12 students, 8 sessions) and tutorial (8 students, 6 sessions)')
