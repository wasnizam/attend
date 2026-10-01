import { classSessionId, classSlots, effectiveStatus, inSemester, parseDate } from './format'
import type { Session, Slot, WeeklyClass } from './types'

/**
 * Something on the calendar: a real session, or a class meeting that has not been
 * started (still to come, or in the past and never held).
 */
export interface AgendaItem {
  key: string
  date: string
  name: string
  startTime: string
  endTime: string
  /** active / ended / scheduled come from a real session; planned and missed are class meetings without one. */
  state: 'active' | 'ended' | 'scheduled' | 'planned' | 'missed'
  session?: Session
  due?: { cls: WeeklyClass; slot: Slot }
}

/** Everything on one date, earliest first. */
export function agendaFor(date: string, sessions: Session[], classes: WeeklyClass[], today: string): AgendaItem[] {
  const weekday = parseDate(date).getDay()
  const ids = new Set(sessions.map((s) => s.id))
  const real: AgendaItem[] = sessions
    .filter((s) => s.date === date)
    .map((session) => ({
      key: session.id,
      date,
      name: session.name,
      startTime: session.startTime,
      endTime: session.endTime,
      state: effectiveStatus(session),
      session,
    }))
  const meetings: AgendaItem[] = classes
    .filter((c) => inSemester(c, date))
    .flatMap((cls) =>
      classSlots(cls)
        .filter((slot) => slot.day === weekday && !ids.has(classSessionId(cls.id, date, slot)))
        .map((slot) => ({
          key: `${cls.id}-${date}-${slot.startTime}`,
          date,
          name: cls.name,
          startTime: slot.startTime,
          endTime: slot.endTime,
          state: date < today ? ('missed' as const) : ('planned' as const),
          due: { cls, slot },
        })),
    )
  return [...real, ...meetings].sort((a, b) => a.startTime.localeCompare(b.startTime))
}
