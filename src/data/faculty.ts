import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { endOf } from '../lib/format'
import { type ClassReport, buildReport } from '../lib/report'
import type { AttendanceRecord, Session, UserProfile, WeeklyClass } from '../lib/types'
import { fetchSessionAttendance } from './attendance'
import { fetchRoster } from './roster'

/** Every session in the organisation between two dates, read once (a faculty's whole semester). */
export async function fetchOrgSessions(organisationId: string, from: string, to: string): Promise<Session[]> {
  const snap = await getDocs(
    query(collection(db, 'sessions'), where('organisationId', '==', organisationId), where('date', '>=', from), where('date', '<=', to), orderBy('date', 'desc'), limit(5000)),
  )
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Session)
}

/** A day still under way is left out, so nobody counts as absent before it is over. */
const finished = (s: Session) => s.status === 'ended' || endOf(s).getTime() <= Date.now()

/**
 * The semester report of every class, for an admin: each class's list and the attendance of the
 * sessions it has held, worked out the same way as the lecturer's own report. Classes are read
 * a few at a time; `onProgress` says how far it has got.
 */
export async function loadFacultyReports(
  viewer: UserProfile,
  classes: WeeklyClass[],
  sessions: Session[],
  onProgress: (done: number, total: number) => void,
): Promise<{ cls: WeeklyClass; report: ClassReport }[]> {
  const out: { cls: WeeklyClass; report: ClassReport }[] = []
  let done = 0
  const one = async (cls: WeeklyClass) => {
    const held = sessions
      .filter((s) => (s.classId === cls.id || s.rosterId === cls.id) && s.status !== 'scheduled' && finished(s))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    if (held.length > 0) {
      const [roster, pairs] = await Promise.all([
        fetchRoster(cls.rosterFrom || cls.id, cls.organisationId, viewer),
        Promise.all(held.map(async (s) => [s.id, await fetchSessionAttendance(s, viewer)] as [string, AttendanceRecord[]])),
      ])
      out.push({ cls, report: buildReport(cls, held, new Map(pairs), roster) })
    }
    onProgress(++done, classes.length)
  }
  for (let i = 0; i < classes.length; i += 4) await Promise.all(classes.slice(i, i + 4).map(one))
  return out
}
