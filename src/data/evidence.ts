import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import type { PreparedFile } from '../lib/evidenceFile'
import { db } from '../lib/firebase'
import { studentKey } from '../lib/format'
import type { Session, UserProfile } from '../lib/types'

/** Why a student was away, and the proof. Kept apart from the attendance record. */
export interface Evidence {
  studentKey: string
  /** Serial number printed on the medical certificate, and the clinic or hospital that issued it. */
  mcNumber?: string
  clinic?: string
  remarks: string
  fileName: string | null
  mimeType: string | null
  dataUrl: string | null
}

// The attendance record can be read back by a participant who knows its ID, so remarks
// and medical certificates live in their own collection that only staff can read.
const evidence = collection(db, 'evidence')

export async function saveEvidence(
  session: Session,
  viewer: UserProfile,
  studentId: string,
  details: { remarks: string; mcNumber?: string; clinic?: string },
  /** A new file, null to remove the current one, or undefined to leave it as it is. */
  file: PreparedFile | null | undefined,
) {
  const key = studentKey(studentId)
  await setDoc(
    doc(evidence, `${session.id}_${key}`),
    {
      sessionId: session.id,
      organisationId: session.organisationId,
      ownerId: session.ownerId,
      studentKey: key,
      remarks: details.remarks.trim(),
      mcNumber: (details.mcNumber ?? '').trim(),
      clinic: (details.clinic ?? '').trim(),
      ...(file === undefined ? {} : { fileName: file?.fileName ?? null, mimeType: file?.mimeType ?? null, dataUrl: file?.dataUrl ?? null }),
      updatedBy: viewer.id,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

/** Remarks and evidence for a session, by student key. Lecturer and admin only. */
export function subscribeEvidence(
  session: Pick<Session, 'id' | 'organisationId'>,
  viewer: UserProfile,
  onData: (byStudent: Map<string, Evidence>) => void,
  onError: (e: Error) => void,
) {
  const constraints = [where('organisationId', '==', session.organisationId), where('sessionId', '==', session.id)]
  if (viewer.role !== 'admin') constraints.push(where('ownerId', '==', viewer.id))
  return onSnapshot(
    query(evidence, ...constraints),
    (snap) => onData(new Map(snap.docs.map((d) => [d.data().studentKey as string, d.data() as Evidence]))),
    onError,
  )
}
