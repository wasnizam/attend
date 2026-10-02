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

export type TrustVisual = 'qr' | 'geo' | 'presence' | 'clock'

interface ShotRow {
  cells: string[]
  /** Colours the last cell (a status). */
  tone?: 'good' | 'warn' | 'bad'
  /** Minutes late, shown under the second cell. */
  late?: number
}

export interface PlanCard {
  name: string
  price: string
  /** What the price is for: "per semester", "a month"… */
  per: string
  /** A second way to pay, in small print. */
  alt?: string
  items: string[]
  /** The one we would pick for most people. */
  best?: boolean
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
  /** The selling points: why this record can be trusted. [drawing, title, text] */
  trust: { title: string; sub: string; cards: [TrustVisual, string, string][] }
  /** Two more made-up screens: the participant's phone and the report. */
  shots: {
    title: string
    phone: { heading: string; session: string; time: string; out?: boolean; caption: string }
    report: { name: string; kind: string; head: string[]; rows: ShotRow[]; caption: string }
  }
  /** The made-up screen in the hero. */
  preview: { title: string; time: string; counted: string; rows: [string, string, string][] }
  orgPlaceholder: string
  /** What is on offer, cheapest first. The first one is the free plan. */
  plans: PlanCard[]
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
      [ICON.screen, 'Lecture, tutorial and lab', 'Keep each type of class apart, and see a student’s attendance for all three side by side.'],
      [ICON.pencil, 'Corrections made easy', 'Mark someone present by hand, or set late, excused or MC, during or after the session.'],
      [ICON.chart, 'Semester reports', 'Every student’s percentage across the semester, with low attendance flagged. Export to Excel.'],
    ],
    steps: [
      ['1. Create', 'Add your semester classes once.'],
      ['2. Scan', 'Show the QR. Students scan with their phone.'],
      ['3. Done', 'Attendance is recorded instantly.'],
    ],
    cta: 'Take attendance in your next class.',
    trust: {
      title: 'No more signing in for a friend',
      sub: 'Paper lists and plain QR codes are easy to cheat. Attend closes the gaps.',
      cards: [
        ['qr', 'A QR that changes every 45 seconds', 'A photo or a forwarded link of the QR is useless a moment later. Only students in front of your screen can check in.'],
        ['geo', 'Location check (geofence)', 'Set a distance around your class. A check-in from outside it is flagged for you, or refused.'],
        ['presence', '“Still here?” check', 'Ask the class to confirm again at any time. You see who scanned and then left.'],
      ],
    },
    shots: {
      title: 'What you and your students see',
      phone: { heading: 'Attendance Confirmed', session: 'Database Systems', time: '10:03 AM', caption: 'On the student’s phone: scan, type the ID, done.' },
      report: {
        name: 'DATABASE SYSTEMS', kind: 'Semester report', head: ['Student', 'Absent', '%', 'Status'],
        rows: [
          { cells: ['Ahmad bin Ali', '0', '100%', 'On track'], tone: 'good' },
          { cells: ['Siti Aminah', '2', '85.7%', 'Warning due'], tone: 'warn' },
          { cells: ['Kumar Raj', '3', '78.6%', 'Barring due'], tone: 'bad' },
        ],
        caption: 'Your semester report: who is getting close to the 80% rule.',
      },
    },
    preview: { title: 'DATABASE SYSTEMS', time: '10:00 AM – 12:00 PM', counted: 'PRESENT', rows: [['ST003', 'Kumar', '10:07'], ['ST002', 'Siti', '10:05'], ['ST001', 'Ahmad', '10:03']] },
    orgPlaceholder: 'e.g. Faculty of Computing',
    plans: [
      { name: 'Free', price: 'RM0', per: 'Free forever', items: ['1 class', 'Unlimited students', 'Every feature included'] },
      { name: 'Pro', price: 'RM39', per: 'per semester', alt: 'Pay once a semester. No monthly bill.', items: ['Unlimited classes', 'Unlimited students', 'Every feature included'], best: true },
    ],
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
      [ICON.pencil, 'Corrections made easy', 'Mark someone present by hand, or set late or excused, during or after the session.'],
      [ICON.screen, 'Works online too', 'For online sessions, participants type the code on your screen, and you can check who is still there.'],
      [ICON.chart, 'Course reports', 'Each participant’s attendance across the course. Export to Excel for your client.'],
    ],
    steps: [
      ['1. Create', 'Add your course or workshop.'],
      ['2. Scan', 'Show the QR. Participants scan with their phone.'],
      ['3. Done', 'Attendance is recorded instantly.'],
    ],
    cta: 'Take attendance at your next session.',
    trust: {
      title: 'Proof that people were really there',
      sub: 'Clients and sponsors want attendance they can trust. Attend gives you that.',
      cards: [
        ['qr', 'A QR that changes every 45 seconds', 'A photo or a forwarded link of the QR is useless a moment later. Only participants in front of your screen can check in.'],
        ['geo', 'Location check (geofence)', 'Set a distance around your venue. A check-in from outside it is flagged for you, or refused.'],
        ['presence', '“Still here?” check', 'Ask everyone to confirm again at any time. You see who scanned and then left.'],
      ],
    },
    shots: {
      title: 'What you and your participants see',
      phone: { heading: 'Attendance Confirmed', session: 'Excel for Managers', time: '9:03 AM', caption: 'On the participant’s phone: scan, type the ID, done.' },
      report: {
        name: 'EXCEL FOR MANAGERS', kind: 'Course report', head: ['Participant', 'Attended', '%'],
        rows: [
          { cells: ['Ahmad bin Ali', '5 / 5', '100%'] },
          { cells: ['Siti Aminah', '4 / 5', '80%'] },
          { cells: ['Kumar Raj', '3 / 5', '60%'] },
        ],
        caption: 'Your course report: attendance for every participant.',
      },
    },
    preview: { title: 'EXCEL FOR MANAGERS', time: '9:00 AM – 5:00 PM', counted: 'PRESENT', rows: [['P003', 'Kumar', '9:07'], ['P002', 'Siti', '9:05'], ['P001', 'Ahmad', '9:03']] },
    orgPlaceholder: 'e.g. Bright Training Sdn Bhd',
    plans: [
      { name: 'Free', price: 'RM0', per: 'Free forever', items: ['1 course', 'Unlimited participants', 'Every feature included'] },
      { name: 'Pro', price: 'RM39', per: 'a month', alt: 'Or RM390 a year: 12 months for the price of 10.', items: ['Unlimited courses', 'Unlimited participants', 'Every feature included'], best: true },
    ],
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
      [ICON.upload, 'Upload your staff list', 'Excel, CSV or PDF. Staff type only their ID, and you see who has not come in by name.'],
      [ICON.calendar, 'MC with proof', 'Record an MC with its number, the clinic and a photo of the slip.'],
      [ICON.chart, 'Timesheet export', 'Hours, lateness and MC for each person. Export to Excel.'],
    ],
    steps: [
      ['1. Create', 'Add your shift and your staff list.'],
      ['2. Scan', 'Show the QR at the door. Staff scan in and out.'],
      ['3. Done', 'Hours and lateness are ready.'],
    ],
    cta: 'Start clocking in tomorrow morning.',
    trust: {
      title: 'No more clocking in for a friend',
      sub: 'Punch cards and plain QR codes are easy to cheat. Attend closes the gaps.',
      cards: [
        ['qr', 'A QR that changes every 45 seconds', 'A photo of the QR is useless a moment later. Only staff standing at your screen can clock in or out.'],
        ['geo', 'Location check (geofence)', 'Set a distance around your workplace. A clock-in from outside it is flagged for you, or refused.'],
        ['clock', 'A time nobody can change', 'The time is recorded by our server, not by the phone. Changing the clock on a phone does nothing.'],
      ],
    },
    shots: {
      title: 'What you and your staff see',
      phone: { heading: 'Clocked in', session: 'Morning shift', time: '8:55 AM', out: true, caption: 'On the staff phone: scan in, scan out.' },
      report: {
        name: 'MORNING SHIFT', kind: 'Today', head: ['Staff', 'In', 'Out', 'Hours'],
        rows: [
          { cells: ['Ahmad bin Ali', '8:55', '18:02', '9 h 07 min'] },
          { cells: ['Siti Aminah', '8:58', '18:00', '9 h 02 min'] },
          { cells: ['Kumar Raj', '9:22', '18:05', '8 h 43 min'], late: 22 },
        ],
        caption: 'Your daily record: time in, time out, hours and lateness.',
      },
    },
    preview: { title: 'MORNING SHIFT', time: '9:00 AM – 6:00 PM', counted: 'IN', rows: [['E003', 'Kumar', '9:07'], ['E002', 'Siti', '8:58'], ['E001', 'Ahmad', '8:55']] },
    orgPlaceholder: 'e.g. Kedai Kopi Maju',
    plans: [
      { name: 'Free', price: 'RM0', per: 'Free forever', items: ['Up to 5 staff', 'Unlimited shifts', 'Every feature included'] },
      { name: 'Pro 20', price: 'RM49', per: 'a month', items: ['Up to 20 staff', 'Unlimited shifts', 'Every feature included'], best: true },
      { name: 'Pro 50', price: 'RM99', per: 'a month', items: ['Up to 50 staff', 'Unlimited shifts', 'Every feature included'] },
      { name: 'Pro 100', price: 'RM179', per: 'a month', items: ['Up to 100 staff', 'Unlimited shifts', 'Every feature included'] },
    ],
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
