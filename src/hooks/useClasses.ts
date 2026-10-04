import { subscribeMyClasses, subscribeOrgClasses } from '../data/classes'
import type { WeeklyClass } from '../lib/types'
import { useProfile } from './useAuth'
import { type Live, useLive } from './useLive'

/** The signed-in lecturer's weekly timetable, live. */
export function useMyClasses(): Live<WeeklyClass[]> {
  const profile = useProfile()
  return useLive<WeeklyClass[]>(
    (onData, onError) => subscribeMyClasses(profile, onData, onError),
    [profile.id, profile.organisationId],
  )
}

/**
 * The classes (or offices) someone may open to edit: their own, and for an admin every one in
 * the organisation.
 */
export function useEditableClasses(): Live<WeeklyClass[]> {
  const profile = useProfile()
  const admin = profile.role === 'admin'
  const mine = useMyClasses()
  const all = useLive<WeeklyClass[]>(admin ? (onData, onError) => subscribeOrgClasses(profile.organisationId, onData, onError) : null, [admin, profile.organisationId])
  return admin ? all : mine
}
