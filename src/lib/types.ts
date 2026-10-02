import type { GeoPoint, Timestamp } from 'firebase/firestore'
import type { Plan } from './plan'
import type { Purpose } from './purpose'

export type Role = 'lecturer' | 'admin'
export type UserStatus = 'active' | 'disabled'
export type SessionStatus = 'scheduled' | 'active' | 'ended'
/** mc = absent with a medical certificate. Like excused, it does not count against the student. */
export type AttendanceStatus = 'present' | 'late' | 'excused' | 'mc'

/** How a class is delivered. Online and hybrid sessions check in with a typed code. */
export type Delivery = 'in_person' | 'online' | 'hybrid'

/** What kind of class it is. Attendance is reported separately for each kind. */
export type ClassKind = 'lecture' | 'tutorial' | 'lab'

/** Optional labels a university uses to tell classes apart. */
export interface CourseDetails {
  kind?: ClassKind
  code?: string
  section?: string
  venue?: string
  delivery?: Delivery
  /** Zoom / Teams / Meet link for online and hybrid classes. Only the lecturer sees it. */
  meetingUrl?: string
}

/** Location check. flag = warn the lecturer only; block = refuse check-ins from too far away. */
export type GeoMode = 'flag' | 'block'

export interface Geofence {
  /** Where the class is held. */
  geoPoint?: GeoPoint | null
  /** How far from that point still counts as "here", in metres. */
  geoRadius?: number
  /** Cosine of the class's latitude, stored so the security rules can measure distance. */
  geoCos?: number
  geoMode?: GeoMode | null
}

/** A "still here?" presence check. It is open until expiresAt. */
export interface Checkpoint {
  n: number
  expiresAt: Timestamp
}

/** One weekly meeting of a class. */
export interface Slot {
  /** Date.getDay(): 0 = Sunday … 6 = Saturday */
  day: number
  startTime: string
  endTime: string
}

export interface UserProfile {
  id: string
  name: string
  email: string
  role: Role
  status: UserStatus
  organisationId: string
  createdAt: Timestamp | null
}

export interface Organisation {
  id: string
  /** What the organisation uses Attend for. Missing means education. */
  purpose?: Purpose
  /** What they pay for. Missing means early access (everything open). */
  plan?: Plan
  /** When the 14-day Pro trial began. */
  trialStarted?: Timestamp | null
  /** Pro runs until this moment. Written by the payment webhook only. */
  paidUntil?: Timestamp | null
  /** Workplace Pro: staff covered by the paid tier. */
  seats?: number
  name: string
  ownerId: string
  inviteCode: string
}

export interface Session extends CourseDetails, Geofence {
  /** Copied from the shift when the day is opened: see WeeklyClass. */
  graceMin?: number | null
  flexible?: boolean
  rotating?: boolean
  daysPerWeek?: number | null
  minStaff?: number | null
  id: string
  organisationId: string
  ownerId: string
  ownerName: string
  name: string
  description: string
  /** Local calendar date, YYYY-MM-DD */
  date: string
  /** HH:mm */
  startTime: string
  /** HH:mm */
  endTime: string
  expected: number | null
  mode: 'qr'
  /** Set when the session was started from a weekly timetable class. */
  classId?: string | null
  /** The class whose student list this session checks IDs against, if any. */
  rosterId?: string | null
  status: SessionStatus
  token: string | null
  presentCount: number
  createdAt: Timestamp | null
  startedAt: Timestamp | null
  endedAt: Timestamp | null
  /** The QR stops accepting check-ins after this moment, even if nobody ends the session. */
  expiresAt: Timestamp | null
  /** Rotating QR: the code a scan must carry, and the one before it. Null when off. */
  qrCode?: string | null
  qrCodePrev?: string | null
  /** The presence check that is open (or was last opened), and how many there have been. */
  checkpoint?: Checkpoint | null
  checkpointCount?: number
  /** When each presence check closed (ms), in order: check 1 is index 0. */
  checkpointTimes?: number[]
}

/** Public, participant-readable summary stored at sessionLinks/{token}. */
/** Who is planned on which shift, for one staff list and one week. */
export interface ShiftPlan {
  id: string
  organisationId: string
  ownerId: string
  /** The staff list (the shift that keeps it). */
  rosterId: string
  /** The Monday the week starts on (YYYY-MM-DD). */
  week: string
  /** Staff key -> date -> shift ID, or 'off' for a rest day. A missing date is not planned. */
  cells: Record<string, Record<string, string>>
}

export interface SessionLink {
  token: string
  sessionId: string
  organisationId: string
  ownerId: string
  name: string
  date: string
  startTime: string
  endTime: string
  status: 'active' | 'ended'
  expiresAt: Timestamp
  venue?: string
  /** True while the rotating code is on: a check-in needs the code from a scan or typed in. */
  needsCode?: boolean
  checkpoint?: Checkpoint | null
  /** Set when the session checks location. The class's coordinates are never published. */
  geo?: GeoMode | null
  /** The organisation's purpose, so the check-in page uses the right words. */
  purpose?: Purpose
  rosterId?: string | null
}

export interface AttendanceRecord {
  id: string
  sessionId: string
  organisationId: string
  ownerId: string
  sessionName: string
  date: string
  studentKey: string
  studentId: string
  studentName: string
  timestamp: Timestamp | null
  status: AttendanceStatus
  method?: 'qr' | 'manual'
}

/** A class that repeats every week of a semester. It becomes a real session the day it is started. */
export interface WeeklyClass extends CourseDetails, Geofence {
  id: string
  organisationId: string
  ownerId: string
  ownerName: string
  name: string
  description: string
  /** Weekdays it runs on, as Date.getDay() numbers: 0 = Sunday … 6 = Saturday. */
  days: number[]
  /** Every weekly meeting. Older classes only have days + one time; use classSlots(). */
  slots?: Slot[]
  /** First and last day of the semester (YYYY-MM-DD). The class only runs between them. */
  startDate?: string | null
  endDate?: string | null
  startTime: string
  endTime: string
  expected: number | null
  /** Number of students on the uploaded class list (0 or missing = no list). */
  rosterCount?: number
  /** Share of the semester's classes a student may miss before a warning, and before barring. */
  warnPct?: number
  barPct?: number
  /** Meetings that were called off: key is meetingKey(date, slot), value is the reason. */
  cancelled?: Record<string, string>
  /** Workplace: minutes after the start before a clock-in counts as late. Missing means 10. */
  graceMin?: number | null
  /** Workplace: flexible hours, so nobody is ever late. */
  flexible?: boolean
  /** Workplace: people rotate between shifts, so who is missing from this one is not counted. */
  rotating?: boolean
  /** Workplace: use another shift's staff list instead of keeping its own. */
  rosterFrom?: string | null
  /** Workplace: how many days a week each person on this shift's list works. Used for people who rotate. */
  daysPerWeek?: number | null
  /** Workplace: fewer people than this clocked in raises a warning. */
  minStaff?: number | null
  createdAt: Timestamp | null
}
