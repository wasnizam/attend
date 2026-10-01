import { subscribeMyClasses } from '../data/classes'
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
