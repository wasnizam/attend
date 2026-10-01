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

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore()
  const classId = 'demo-data-structures'
  const today = new Date()
  const start = new Date(today); start.setDate(start.getDate() - 7 * 8)
  const end = new Date(start); end.setDate(end.getDate() + 7 * 14 - 1)
  const weekday = today.getDay()
  const base = { organisationId: org, ownerId: uid }
  let batch = writeBatch(db)
  batch.set(doc(db, 'classes', classId), {
    ...base, ownerName: name, name: 'Data Structures', description: '', code: 'SECJ2013', section: '03', venue: 'N28 BK2',
    delivery: 'in_person', meetingUrl: '', slots: [{ day: weekday, startTime: '09:00', endTime: '11:00' }], days: [weekday],
    startTime: '09:00', endTime: '11:00', startDate: iso(start), endDate: iso(end), expected: null, rosterCount: students.length,
    createdAt: Timestamp.now(),
  })
  for (const s of students) batch.set(doc(db, 'rosters', classId, 'students', s.studentKey), { ...s, ...base })
  await batch.commit()

  let seed = 7
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  for (let w = 8; w >= 1; w--) {
    const day = new Date(today); day.setDate(day.getDate() - 7 * w)
    const date = iso(day)
    const sessionId = `${classId}_${date}_0900`
    const at = (min) => Timestamp.fromDate(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, min))
    batch = writeBatch(db)
    let present = 0
    students.forEach((s, i) => {
      if (rand() > reliability[i]) return
      const late = rand() < 0.12
      const excused = !late && rand() < 0.04
      if (!excused) present++
      batch.set(doc(db, 'attendance', `${sessionId}_${s.studentKey}`), {
        ...base, sessionId, sessionName: 'Data Structures', date, ...s, token: 'DEMO00',
        timestamp: at(late ? 20 + Math.floor(rand() * 15) : Math.floor(rand() * 10)),
        status: excused ? 'excused' : late ? 'late' : 'present', method: excused ? 'manual' : 'qr',
      })
    })
    batch.set(doc(db, 'sessions', sessionId), {
      ...base, ownerName: name, name: 'Data Structures', description: '', date, startTime: '09:00', endTime: '11:00',
      expected: students.length, code: 'SECJ2013', section: '03', venue: 'N28 BK2', delivery: 'in_person', meetingUrl: '',
      mode: 'qr', classId, rosterId: classId, status: 'ended', token: 'DEMO00', presentCount: present,
      createdAt: at(0), startedAt: at(0), endedAt: at(120), expiresAt: at(120),
    })
    await batch.commit()
  }
})
await env.cleanup()
console.log('Seeded: Data Structures, 12 students, 8 sessions')
