import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'

/** A message from the Attend team, shown in customers' apps between two dates. */
export interface LiveAnnouncement {
  id: string
  title: string
  body: string
  level: 'info' | 'warning'
  audience: 'all' | 'education' | 'training' | 'workplace'
  from: string
  to: string
  active: boolean
}

export function subscribeLiveAnnouncements(onData: (rows: LiveAnnouncement[]) => void) {
  return onSnapshot(
    collection(db, 'announcements'),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as LiveAnnouncement)),
    () => onData([]),
  )
}
