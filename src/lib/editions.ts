import type { Purpose } from './purpose'

/**
 * The three ways Attend is sold. One brand and one engine, but each group gets its own
 * address, its own words on the landing page, its own sign-up and its own plan.
 */
export type EditionId = 'lecturers' | 'trainers' | 'workplace'

const ICON = {
  calendar: 'M8 2v3M16 2v3M3.5 9h17M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6A1.5 1.5 0 0 1 5 4.5Z',
  upload: 'M12 16V4m0 0L8 8m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
  rotate: 'M4 4v6h6M20 20v-6h-6M20 9A8 8 0 0 0 6.300 5.300L4 10m16 4-2.300 4.700A8 8 0 0 1 4 15',
  pencil: 'M12 20h9M16.500 3.500a2.100 2.100 0 0 1 3 3L7 19l-4 1 1-4L16.500 3.500Z',
  chart: 'M4 20v-7M10 20V4M16 20v-10M22 20H2',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  pin: 'M12 21s7-6.100 7-11.500A7 7 0 0 0 5 9.500C5 14.900 12 21 12 21Zm0-9a2.500 2.500 0 1 0 0-5 2.500 2.500 0 0 0 0 5Z',
  screen: 'M3 5h18v11H3zM8 20h8M12 16v4',
}

export interface Edition {
  id: EditionId
  /** What the organisation is set up as when someone signs up from this edition. */
  purpose: Purpose
  /** Name on the switch, and after "Attend for". */
  label: string
  badge: string
  headline: string
  sub: string
  note: string
  featuresTitle: string
  /** [icon path, title, text] */
  features: [string, string, string][]
  steps: [string, string][]
  cta: string
  /** The made-up screen in the hero. */
  preview: { title: string; time: string; counted: string; rows: [string, string, string][] }
  orgPlaceholder: string
  free: string[]
  pro: string[]
  /** How the paid plan is charged. */
  billing: string
}

export const EDITIONS: Edition[] = [
  {
    id: 'lecturers',
    purpose: 'education',
    label: 'Lecturers',
    badge: 'QR attendance for lecturers',
    headline: 'Attendance, without the hassle.',
    sub: 'Start your class. Show the QR. Know who attended.',
    note: 'No app for students to install.',
    featuresTitle: 'Everything a lecturer needs, nothing more',
    features: [
      [ICON.calendar, 'Semester timetable', 'Add your classes once. Each one is waiting on the right day, ready to start in one tap.'],
      [ICON.upload, 'Upload your class list', 'Excel, CSV or PDF. Students type only their ID, and you see who is absent by name.'],
      [ICON.bolt, 'Live attendance', 'Names appear on your screen the moment students check in. No refreshing.'],
      [ICON.rotate, 'Rotating QR', 'The code changes every 45 seconds, so a forwarded link or photo stops working.'],
      [ICON.pencil, 'Corrections made easy', 'Mark someone present by hand, or set late, excused or MC, during or after the session.'],
      [ICON.chart, 'Semester reports', 'Every student’s percentage across the semester, with low attendance flagged. Export to Excel.'],
    ],
    steps: [
      ['1. Create', 'Add your semester classes once.'],
      ['2. Scan', 'Show the QR. Students scan with their phone.'],
      ['3. Done', 'Attendance is recorded instantly.'],
    ],
    cta: 'Take attendance in your next class.',
    preview: { title: 'DATABASE SYSTEMS', time: '10:00 AM – 12:00 PM', counted: 'PRESENT', rows: [['ST003', 'Kumar', '10:07'], ['ST002', 'Siti', '10:05'], ['ST001', 'Ahmad', '10:03']] },
    orgPlaceholder: 'e.g. Faculty of Computing',
    free: ['1 class', 'Unlimited students', 'Every feature included'],
    pro: ['Unlimited classes', 'Unlimited students', 'Every feature included'],
    billing: 'Per lecturer. Pay by month or by semester.',
  },
  {
    id: 'trainers',
    purpose: 'training',
    label: 'Trainers',
    badge: 'QR attendance for trainers',
    headline: 'Every participant accounted for.',
    sub: 'Start the session. Show the QR. Get a clean attendance record for every course.',
    note: 'No app for participants to install.',
    featuresTitle: 'Everything a trainer needs, nothing more',
    features: [
      [ICON.calendar, 'Courses and workshops', 'Add a course once with its dates. Each session is waiting on the right day.'],
      [ICON.upload, 'Upload your participant list', 'Excel, CSV or PDF. Participants type only their ID, and you see who is absent by name.'],
      [ICON.bolt, 'Live attendance', 'Names appear on your screen the moment participants check in. No refreshing.'],
      [ICON.rotate, 'Rotating QR', 'The code changes every 45 seconds, so a forwarded link or photo stops working.'],
      [ICON.screen, 'Works online too', 'For online sessions, participants type the code on your screen, and you can check who is still there.'],
      [ICON.chart, 'Course reports', 'Each participant’s attendance across the course. Export to Excel for your client.'],
    ],
    steps: [
      ['1. Create', 'Add your course or workshop.'],
      ['2. Scan', 'Show the QR. Participants scan with their phone.'],
      ['3. Done', 'Attendance is recorded instantly.'],
    ],
    cta: 'Take attendance at your next session.',
    preview: { title: 'EXCEL FOR MANAGERS', time: '9:00 AM – 5:00 PM', counted: 'PRESENT', rows: [['P003', 'Kumar', '9:07'], ['P002', 'Siti', '9:05'], ['P001', 'Ahmad', '9:03']] },
    orgPlaceholder: 'e.g. Bright Training Sdn Bhd',
    free: ['1 course', 'Unlimited participants', 'Every feature included'],
    pro: ['Unlimited courses', 'Unlimited participants', 'Every feature included'],
    billing: 'Per trainer. Pay by month.',
  },
  {
    id: 'workplace',
    purpose: 'workplace',
    label: 'Workplace',
    badge: 'QR clock-in for workplaces',
    headline: 'Clock in with a scan.',
    sub: 'Staff scan when they arrive and when they leave. Hours and lateness are worked out for you.',
    note: 'No app for staff to install. No card reader to buy.',
    featuresTitle: 'A time clock without the hardware',
    features: [
      [ICON.clock, 'Clock in and out', 'Staff scan the QR when they arrive and again when they leave. It takes seconds.'],
      [ICON.bolt, 'Hours worked out for you', 'Time in, time out and total hours for each person, every day.'],
      [ICON.pencil, 'Lateness without arguments', 'Anyone more than 10 minutes late is flagged by itself, with the minutes.'],
      [ICON.rotate, 'Rotating QR', 'The code changes every 45 seconds, so nobody clocks in from home with a photo.'],
      [ICON.pin, 'Location check', 'Flag or refuse a clock-in made away from the workplace.'],
      [ICON.chart, 'Timesheet export', 'Hours, lateness and MC for each person. Export to Excel.'],
    ],
    steps: [
      ['1. Create', 'Add your shift and your staff list.'],
      ['2. Scan', 'Show the QR at the door. Staff scan in and out.'],
      ['3. Done', 'Hours and lateness are ready.'],
    ],
    cta: 'Start clocking in tomorrow morning.',
    preview: { title: 'MORNING SHIFT', time: '9:00 AM – 6:00 PM', counted: 'IN', rows: [['E003', 'Kumar', '9:07'], ['E002', 'Siti', '8:58'], ['E001', 'Ahmad', '8:55']] },
    orgPlaceholder: 'e.g. Kedai Kopi Maju',
    free: ['Up to 5 staff', 'Unlimited shifts', 'Every feature included'],
    pro: ['Unlimited staff', 'Unlimited shifts', 'Every feature included'],
    billing: 'Per staff member. Pay by month.',
  },
]

const KEY = 'attend.edition'

export const editionById = (id: string | null | undefined) => EDITIONS.find((e) => e.id === id)
export const editionForPurpose = (purpose: Purpose) => EDITIONS.find((e) => e.purpose === purpose)

/** Remembers which door a visitor came in by, so sign-up (even via Google) sets up the right edition. */
export function rememberEdition(id: EditionId) {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // Private mode: the address still carries the choice.
  }
}

export function rememberedEdition(): Edition {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(KEY)
  } catch {
    // ignore
  }
  return editionById(stored) ?? EDITIONS[0]
}
