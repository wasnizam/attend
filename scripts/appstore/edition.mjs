// LOCAL EMULATOR ONLY. Shows the sample account as one edition for the App Store captures: the
// organisation's purpose, and the sample class and its sessions renamed to fit (a course for
// trainers, a shift for a workplace). Run with "lecturer" to put everything back.
// Usage: node scripts/appstore/edition.mjs <organisationId> <lecturer|trainer|workplace>
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore'

const [org, edition] = process.argv.slice(2)
const LOOKS = {
  lecturer: { purpose: 'education', name: 'Data Structures', venue: 'N28 BK2', code: 'SECJ2013', section: '03' },
  trainer: { purpose: 'training', name: 'Leadership Workshop', venue: 'Training Room 2, KL', code: '', section: '' },
  workplace: { purpose: 'workplace', name: 'Morning shift', venue: 'Head Office, KL', code: '', section: '' },
}
const look = LOOKS[edition]
if (!org || !look) throw new Error('Usage: node scripts/appstore/edition.mjs <organisationId> <lecturer|trainer|workplace>')

const env = await initializeTestEnvironment({ projectId: 'demo-attendance', firestore: { host: '127.0.0.1', port: 8080 } })
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore()
  await updateDoc(doc(db, 'organisations', org), { purpose: look.purpose })
  const { name, venue, code, section } = look
  await updateDoc(doc(db, 'classes', 'demo-data-structures'), { name, venue, code, section })
  const sessions = await getDocs(query(collection(db, 'sessions'), where('classId', '==', 'demo-data-structures')))
  const batch = writeBatch(db)
  for (const s of sessions.docs) batch.update(s.ref, { name, venue, code, section })
  await batch.commit()
  const records = await getDocs(query(collection(db, 'attendance'), where('organisationId', '==', org)))
  for (let i = 0; i < records.docs.length; i += 400) {
    const b = writeBatch(db)
    for (const r of records.docs.slice(i, i + 400)) if (sessions.docs.some((s) => s.id === r.data().sessionId)) b.update(r.ref, { sessionName: name })
    await b.commit()
  }
  console.log('now', edition, sessions.size, 'sessions')
})
await env.cleanup()
