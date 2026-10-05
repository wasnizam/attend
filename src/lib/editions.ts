import type { Currency } from './currency'
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
  building: 'M3 21h18M5 21V5l7-2v18M12 21V9l7 2v10M8 9h1M8 13h1M8 17h1M15 13h1M15 17h1',
  leave: 'M8 2v3M16 2v3M3.5 9h17M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6A1.5 1.5 0 0 1 5 4.5ZM9 14l2 2 4-4',
  live: 'M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8',
  file: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Zm0 0v5h5M9 13h6M9 17h6',
}

export type TrustVisual = 'qr' | 'geo' | 'presence' | 'clock' | 'phone' | 'door' | 'lock'

interface ShotRow {
  cells: string[]
  /** Colours the last cell (a status). */
  tone?: 'good' | 'warn' | 'bad'
  /** Minutes late, shown under the second cell. */
  late?: number
}

export interface PlanCard {
  name: string
  /** Round prices in each currency, not a conversion of one another. */
  price: Record<Currency, string>
  /** What the price is for: "per semester", "a month"… */
  per: string
  /** A second way to pay, in small print. */
  alt?: string | Record<Currency, string>
  /** What the plan includes. A line starting with "✕ " is shown as not included. */
  items: string[]
  /** The one we would pick for most people. */
  best?: boolean
}

/** Workplace: in every plan, free included. */
const WORK_BASICS = ['QR clock in and out', 'Today screen: who is in, late or gone', 'Daily list of times and hours', 'Door screen with a PIN', 'Reports on screen: week, month and year', 'Full history']
/** Workplace: paid plans only. */
const WORK_PRO = [
  'Many offices and branch managers',
  'Night, rotating and planned shifts',
  'Download reports as PDF',
  'Export to Excel for payroll',
  'Overtime, rest day and holiday hours',
  'Leave and sick leave tracking',
  'Location check (geofence)',
  'One phone per person',
]

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
  /** What a customer does not need to buy or set up: the case for no machine and no app. */
  without: { title: string; skip: string[]; need: string; focus?: string; saving?: string | Record<Currency, string> }
  /** Questions only this group asks, added to the shared FAQ. */
  faq?: [string, string][]
  /** Four big facts under the top section; the general ones are used when missing. */
  facts?: [string, string][]
  /** What is on offer, cheapest first. The first one is the free plan. */
  plans: PlanCard[]
}

export const EDITIONS: Edition[] = [
  {
    id: 'lecturers',
    purpose: 'education',
    label: 'Lecturers',
    badge: 'Works alongside your university system',
    headline: 'Attendance in seconds. | No signing for friends.',
    sub: 'Keep your university system. Attend takes attendance with a QR that cannot be shared, then exports to your portal in one click.',
    note: 'No app for students to install.',
    facts: [
      ['10 min', 'Back in a big class'],
      ['45s', 'A new QR code, every 45 seconds'],
      ['1 click', 'Export to your university portal'],
      ['80%', 'Rule worked out for you'],
    ],
    featuresTitle: 'Built for the way lecturers really work',
    features: [
      [ICON.bolt, 'Up to 10 minutes back, every class', 'Show the QR and students scan with their phone camera. No sheet passed round, no names called, no slow portal to open.'],
      [ICON.upload, 'One-click export to your portal', 'Set the file up once the way your university system wants it: codes, date format, layout. Then upload in one click.'],
      [ICON.file, 'Warning letters and barring list', 'See who is due a warning or barring at any moment. The letters and the list for your faculty are made for you as PDFs.'],
      [ICON.chart, 'The 80% rule, worked out', 'Every student’s percentage and how many more classes they can miss, updated after every class.'],
      [ICON.pencil, 'MCs and corrections', 'Mark late, excused or sick, keep the MC with the record, and fix anything during or after class.'],
      [ICON.calendar, 'Your whole semester', 'Lectures, tutorials and labs, every section. Upload the class list from your portal’s export, and each class is ready on the right day.'],
    ],
    steps: [
      ['1. Add', 'Upload your class list from your portal’s export.'],
      ['2. Scan', 'Show the QR. Students scan with their phone.'],
      ['3. Export', 'Upload to your portal in one click. Letters are ready when you need them.'],
    ],
    cta: 'Get your time back in your next class.',
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
          { cells: ['Ahmad Ali', '0', '100%', 'On track'], tone: 'good' },
          { cells: ['Sarah Lee', '2', '85.7%', 'Watch'], tone: 'warn' },
          { cells: ['Kumar Raj', '3', '78.6%', 'At risk'], tone: 'bad' },
        ],
        caption: 'Your semester report: who is getting close to the 80% rule.',
      },
    },
    preview: { title: 'DATABASE SYSTEMS', time: '10:00 AM – 12:00 PM', counted: 'PRESENT', rows: [['ST003', 'Kumar', '10:07'], ['ST002', 'Sarah', '10:05'], ['ST001', 'Ahmad', '10:03']] },
    orgPlaceholder: 'e.g. Faculty of Computing',
    without: {
      title: 'Keep your university system. Lose the hassle.',
      skip: ['Passing a sign-in sheet round', 'Calling out every name', 'Typing attendance into the portal again', 'Working out the 80% rule by hand'],
      need: 'Your university system keeps the official record. Attend takes attendance for you, then exports in the exact format your portal accepts.',
      focus: 'A big class can take 10 minutes to sign in. Over a semester, that is hours of teaching time back.',
    },
    faq: [
      ['My university already has a system. Why use Attend?', 'Keep it. Attend is for taking attendance quickly and honestly; your university system keeps the official record. Set up the export once, then upload in one click.'],
      ['Is it allowed?', 'Attend is your own tool, like Excel or a quiz app. The official record still goes into your university system. If your university has rules on student data, check them; Attend keeps only the ID and name from your class list.'],
    ],
    plans: [
      { name: 'Free', price: { myr: 'RM0', usd: '$0' }, per: 'Free forever', items: ['1 class', 'Unlimited students', 'Every feature included'] },
      { name: 'Pro', price: { myr: 'RM39', usd: '$9' }, per: 'per semester', alt: 'Pay once a semester. No monthly bill.', items: ['Unlimited classes', 'Unlimited students', 'Export to your university system', 'Warning letters and barring list', 'Every feature included'], best: true },
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
          { cells: ['Ahmad Ali', '5 / 5', '100%'] },
          { cells: ['Sarah Lee', '4 / 5', '80%'] },
          { cells: ['Kumar Raj', '3 / 5', '60%'] },
        ],
        caption: 'Your course report: attendance for every participant.',
      },
    },
    preview: { title: 'EXCEL FOR MANAGERS', time: '9:00 AM – 5:00 PM', counted: 'PRESENT', rows: [['P003', 'Kumar', '9:07'], ['P002', 'Sarah', '9:05'], ['P001', 'Ahmad', '9:03']] },
    orgPlaceholder: 'e.g. Bright Training Sdn Bhd',
    without: {
      title: 'Nothing to buy. Nothing to install.',
      skip: ['A sign-in machine at the door', 'An app for participants', 'Participant accounts or passwords', 'Paper sign-in sheets'],
      need: 'Just your laptop or the screen in the room, and participants’ own phones.',
    },
    plans: [
      { name: 'Free', price: { myr: 'RM0', usd: '$0' }, per: 'Free forever', items: ['1 course', 'Unlimited participants', 'Every feature included'] },
      { name: 'Pro', price: { myr: 'RM39', usd: '$9' }, per: 'a month', alt: { myr: 'Or RM390 a year: 12 months for the price of 10.', usd: 'Or $90 a year: 12 months for the price of 10.' }, items: ['Unlimited courses', 'Unlimited participants', 'Every feature included'], best: true },
    ],
  },
  {
    id: 'workplace',
    purpose: 'workplace',
    label: 'Workplace',
    badge: 'QR clock-in for workplaces',
    headline: 'No machine. No app. | Just scan.',
    sub: 'Staff clock in and out with the phone they already have. Show the QR on any screen you already own: a tablet, a laptop or a TV.',
    note: 'No machine to buy. No app for staff to install.',
    featuresTitle: 'A time clock without the hardware',
    features: [
      [ICON.screen, 'A door screen that runs itself', 'Leave a tablet at the entrance. It opens each day on time and shows a fresh QR. Staff scan in and out in seconds.'],
      [ICON.live, 'Who is in, right now', 'The Today screen shows who came, who is late, who has left and who is not in yet, as it happens.'],
      [ICON.pencil, 'Lateness and early leave', 'Late arrivals are flagged with the minutes. You set the grace period, and can allow an early leave with a reason.'],
      [ICON.calendar, 'Office hours or shifts', 'Fixed hours, two or three shifts, night shifts or flexible hours, with a weekly shift plan for people who rotate.'],
      [ICON.building, 'Many offices, one company', 'Each branch has its own hours and staff list. Branch managers see only their office; you see them all.'],
      [ICON.leave, 'Leave, sick days and half days', 'Record annual, emergency, unpaid and sick leave, with the doctor’s note, and half days. Leave never counts as absent.'],
      [ICON.bolt, 'Overtime that fits your local law', 'Choose when overtime starts: after a full day or after the end time. Rest days and public holidays are counted apart for their own rates.'],
      [ICON.file, 'Reports HR can hand over', 'Monthly report with charts as a PDF, Excel for payroll, attendance rate, and a timesheet per person to sign.'],
      [ICON.upload, 'Upload your staff list', 'Excel, CSV or PDF, with departments. Staff type only their ID, and you see who has not come in by name.'],
    ],
    steps: [
      ['1. Create', 'Add your shift and your staff list.'],
      ['2. Scan', 'Show the QR at the door. Staff scan in and out.'],
      ['3. Done', 'Hours and lateness are ready.'],
    ],
    cta: 'Start clocking in tomorrow morning.',
    trust: {
      title: 'No more clocking in for a friend',
      sub: 'Punch cards and plain QR codes are easy to cheat. Attend closes the gaps, one by one.',
      cards: [
        ['qr', 'A QR that changes every 45 seconds', 'A photo of the QR is useless a moment later. Only staff standing at your screen can clock in or out.'],
        ['phone', 'One phone per person', 'Each person’s first clock-in registers their phone. A clock-in from someone else’s phone is flagged, or refused until you approve it.'],
        ['geo', 'Location check (geofence)', 'Set a distance around your workplace. A clock-in from outside it is flagged for you, or refused.'],
        ['clock', 'A time nobody can change', 'The time is recorded by our server, not by the phone. Changing the clock on a phone does nothing.'],
        ['door', 'A door screen locked with a PIN', 'Leaving the door screen needs your PIN, so nobody at the door can get into your account or your records.'],
        ['lock', 'Records kept honest', 'Staff cannot change their own times, and anyone added by hand is labelled “added by hand”. Each company’s records are kept apart, and branch managers see only their own office.'],
      ],
    },
    shots: {
      title: 'What you and your staff see',
      phone: { heading: 'Clocked in', session: 'Morning shift', time: '8:55 AM', out: true, caption: 'On the staff phone: scan in, scan out.' },
      report: {
        name: 'MORNING SHIFT', kind: 'Today', head: ['Staff', 'In', 'Out', 'Hours'],
        rows: [
          { cells: ['Ahmad Ali', '8:55', '18:02', '9 h 07 min'] },
          { cells: ['Sarah Lee', '8:58', '18:00', '9 h 02 min'] },
          { cells: ['Kumar Raj', '9:22', '18:05', '8 h 43 min'], late: 22 },
        ],
        caption: 'Your daily record: time in, time out, hours and lateness.',
      },
    },
    preview: { title: 'MORNING SHIFT', time: '9:00 AM – 6:00 PM', counted: 'IN', rows: [['E003', 'Kumar', '9:07'], ['E002', 'Sarah', '8:58'], ['E001', 'Ahmad', '8:55']] },
    orgPlaceholder: 'e.g. Sunrise Café',
    without: {
      title: 'Nothing to buy. Nothing to install.',
      skip: ['A fingerprint or face-scan machine', 'An app on every staff phone', 'Accounts and passwords for staff', 'Anyone’s face or fingerprint on file'],
      need: 'Just a screen at the door, and your staff’s own phones.',
      focus: 'Just attendance, done properly. Keep your payroll or HR system; Attend gives it clean data.',
      saving: {
        myr: 'A basic attendance machine costs around RM500 to RM1,000 or more, plus setup and repairs. Attend needs none.',
        usd: 'A basic attendance machine costs around $100 to $1,000 or more, plus setup and repairs. Attend needs none.',
      },
    },
    faq: [
      ['Do you do payroll?', 'No, on purpose. Attend does attendance only, and does it properly. It exports clean reports for your payroll, your HR system or your accountant.'],
      ['Does it follow our country’s labour rules?', 'You set your working hours, grace period, breaks, public holidays and when overtime starts, so the hours match your local rules.'],
      ['What does the free plan leave out?', 'The free plan covers daily attendance for up to 5 staff: clock in and out, the Today screen, the daily list and the door screen, with all your history and reports to view on screen. Downloading reports as PDF, Excel export, overtime, leave, many offices, shift plans, the location check and one phone per person come with a paid plan.'],
    ],
    plans: [
      { name: 'Free', price: { myr: 'RM0', usd: '$0' }, per: 'Free forever', items: ['Up to 5 staff', ...WORK_BASICS, ...WORK_PRO.map((x) => `✕ ${x}`)] },
      { name: 'Pro 20', price: { myr: 'RM49', usd: '$12' }, per: 'a month', items: ['Up to 20 staff', ...WORK_BASICS, ...WORK_PRO], best: true },
      { name: 'Pro 50', price: { myr: 'RM99', usd: '$24' }, per: 'a month', items: ['Up to 50 staff', ...WORK_BASICS, ...WORK_PRO] },
      { name: 'Pro 100', price: { myr: 'RM179', usd: '$45' }, per: 'a month', items: ['Up to 100 staff', ...WORK_BASICS, ...WORK_PRO] },
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
