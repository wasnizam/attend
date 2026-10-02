import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { ShiftPlan, UserProfile, WeeklyClass } from '../lib/types'

// A week of planned shifts for one staff list lives at plans/{listId}_{monday}.
const plans = collection(db, 'plans')

function planQuery(listId: string, viewer: UserProfile, weeks: string[]) {
  // The rules allow whoever manages the list's class now (or an admin).
  return query(plans, where('organisationId', '==', viewer.organisationId), where('rosterId', '==', listId), where('week', 'in', weeks))
}

const toPlan = (d: { id: string; data(): object }) => ({ id: d.id, ...d.data() }) as ShiftPlan

/** One week's plan, live. Null when nothing has been planned for it. */
export function subscribePlan(listId: string, week: string, viewer: UserProfile, onData: (plan: ShiftPlan | null) => void, onError: (e: Error) => void) {
  return onSnapshot(planQuery(listId, viewer, [week]), (snap) => onData(snap.empty ? null : toPlan(snap.docs[0])), onError)
}

/** Several weeks at once (up to 30), for a report. */
export async function fetchPlans(listId: string, weeks: string[], viewer: UserProfile): Promise<ShiftPlan[]> {
  if (weeks.length === 0) return []
  return (await getDocs(planQuery(listId, viewer, weeks.slice(0, 30)))).docs.map(toPlan)
}

export const savePlan = (list: WeeklyClass, week: string, cells: ShiftPlan['cells']) =>
  setDoc(doc(plans, `${list.id}_${week}`), {
    organisationId: list.organisationId,
    ownerId: list.ownerId,
    rosterId: list.id,
    week,
    cells,
    updatedAt: serverTimestamp(),
  })
