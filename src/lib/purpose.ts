/**
 * What an organisation uses Attend for. One engine serves all of them; the purpose only
 * decides which words are used and which features are shown. It is chosen by the landing
 * page someone signs up from (see editions.ts) and cannot be changed afterwards.
 */
export type Purpose = 'education' | 'training' | 'events' | 'workplace'

export const PURPOSES: { id: Purpose; label: string; text: string }[] = [
  { id: 'education', label: 'University or college', text: 'Semester classes, lectures, tutorials and labs, the 80% rule.' },
  { id: 'training', label: 'Training provider', text: 'Courses and workshops with a list of participants.' },
  { id: 'events', label: 'Events and conferences', text: 'One-off events. Guests check in at the door.' },
  { id: 'workplace', label: 'Workplace', text: 'Staff clock in and out each day. Hours and lateness are worked out for you.' },
]

/** Parts of the product that only some purposes need. */
export type Feature =
  /** Classes that repeat every week between two dates, the timetable, and reports per class. */
  | 'recurring'
  /** Lecture / tutorial / lab, and the subject report that compares them. */
  | 'classKind'
  /** The university attendance rule: warning and barring levels, "can still miss". */
  | 'barring'
  /** Medical certificate as its own status, with number, clinic and evidence. */
  | 'mc'
  /** Clock-out as well as clock-in: hours worked, and lateness worked out from the time. */
  | 'clock'

const FEATURES: Record<Purpose, Feature[]> = {
  education: ['recurring', 'classKind', 'barring', 'mc'],
  training: ['recurring', 'mc'],
  events: [],
  workplace: ['recurring', 'mc', 'clock'],
}

let purpose: Purpose = 'education'

export const getPurpose = () => purpose
export const setPurpose = (next: Purpose | undefined | null) => {
  purpose = next && next in FEATURES ? next : 'education'
}
export const has = (feature: Feature) => FEATURES[purpose].includes(feature)

// Word swaps, applied to finished interface text. Longest phrases first, so "Student ID"
// is handled before "Student". Education is the wording the app is written in.
type Swap = [RegExp, string]
const swaps = (pairs: [string, string][]): Swap[] => pairs.map(([from, to]) => [new RegExp(`\\b${from}\\b`, 'g'), to])

const TERMS: Record<'en' | 'ms', Partial<Record<Purpose, Swap[]>>> = {
  en: {
    training: swaps([
      ['Your classes this semester', 'Your current courses'],
      ['Attendance for each class this semester', 'Attendance for each course'],
      ['Semester classes', 'Courses'], ['semester classes', 'courses'],
      ['Semester class', 'Course'], ['semester class', 'course'],
      ['Past semesters', 'Past courses'], ['this semester', 'this course'], ['the semester', 'the course'],
      ['Semester', 'Course'], ['semester', 'course'],
      ['Student ID', 'Participant ID'], ['student ID', 'participant ID'],
      ['Students', 'Participants'], ['students', 'participants'], ['Student', 'Participant'], ['student', 'participant'],
      ['Lecturers', 'Trainers'], ['lecturers', 'trainers'], ['Lecturer', 'Trainer'], ['lecturer', 'trainer'],
    ]),
    events: swaps([
      ['Enter your student ID:', 'Enter your email or phone number:'],
      ['Student ID', 'Email or phone'], ['student ID', 'email or phone number'],
      ['Students', 'Attendees'], ['students', 'attendees'], ['Student', 'Attendee'], ['student', 'attendee'],
      ['Lecturers', 'Organisers'], ['lecturers', 'organisers'], ['Lecturer', 'Organiser'], ['lecturer', 'organiser'],
      ['Session / class name', 'Event name'], ['New session', 'New event'], ['Create session', 'Create event'],
      ['Past sessions', 'Past events'], ['sessions', 'events'], ['Sessions', 'Events'], ['session', 'event'], ['Session', 'Event'],
    ]),
    workplace: swaps([
      ['Add the classes you teach this semester once', 'Add your shifts once'],
      ['Your classes this semester', 'Your shifts'],
      ['Attendance for each class this semester', 'Attendance for each shift'],
      ['Scan this QR to mark attendance', 'Scan to clock in or out'],
      ['Start Attendance', 'Open clock-in'], ['End Attendance', 'Close for the day'],
      ['Attendance Confirmed', 'Clocked in'], ['Confirm Attendance', 'Clock in or out'],
      ['Semester starts', 'From'], ['Semester ends', 'Until'], ['Semester report', 'Shift report'],
      ['Semester classes', 'Shifts'], ['semester classes', 'shifts'], ['Semester class', 'Shift'], ['semester class', 'shift'],
      ['Past semesters', 'Past shifts'], ['this semester', 'this period'], ['the semester', 'the period'],
      ['Semester', 'Period'], ['semester', 'period'],
      ['Student list', 'Staff list'], ['student list', 'staff list'], ['class list', 'staff list'],
      ['Student ID', 'Staff ID'], ['student ID', 'staff ID'],
      ['Students', 'Staff'], ['students', 'staff'], ['Student', 'Employee'], ['student', 'employee'],
      ['Lecturers', 'Managers'], ['lecturers', 'managers'], ['Lecturer', 'Manager'], ['lecturer', 'manager'],
      ['Classes', 'Shifts'], ['classes', 'shifts'], ['Class', 'Shift'], ['class', 'shift'],
      ['PRESENT', 'IN'], ['Session Active', 'Open'],
      ['Excused', 'On leave'], ['excused', 'on leave'],
    ]),
  },
  ms: {
    training: swaps([
      ['Kelas semester', 'Kursus'], ['kelas semester', 'kursus'], ['Semester lepas', 'Kursus lepas'],
      ['Semester', 'Kursus'], ['semester', 'kursus'],
      ['No\\. Matrik', 'No. ID Peserta'], ['no\\. matrik', 'no. ID peserta'],
      ['Pelajar', 'Peserta'], ['pelajar', 'peserta'],
      ['Pensyarah', 'Jurulatih'], ['pensyarah', 'jurulatih'],
    ]),
    events: swaps([
      ['No\\. Matrik', 'E-mel atau telefon'], ['no\\. matrik', 'e-mel atau no. telefon'],
      ['Pelajar', 'Peserta'], ['pelajar', 'peserta'],
      ['Pensyarah', 'Penganjur'], ['pensyarah', 'penganjur'],
      ['Sesi', 'Acara'], ['sesi', 'acara'],
    ]),
    workplace: swaps([
      ['Tambah kelas yang anda ajar semester ini sekali sahaja', 'Tambah syif anda sekali sahaja'],
      ['Kehadiran Disahkan', 'Rekod masuk berjaya'], ['Sahkan Kehadiran', 'Rekod masuk atau keluar'],
      ['Mula Kehadiran', 'Buka rekod masuk'], ['Tamat Kehadiran', 'Tutup untuk hari ini'],
      ['Kelas semester', 'Syif'], ['kelas semester', 'syif'], ['Semester lepas', 'Syif lepas'],
      ['Semester', 'Tempoh'], ['semester', 'tempoh'],
      ['No\\. Matrik', 'No. Pekerja'], ['no\\. matrik', 'no. pekerja'],
      ['Pelajar', 'Pekerja'], ['pelajar', 'pekerja'],
      ['Pensyarah', 'Pengurus'], ['pensyarah', 'pengurus'],
      ['Kelas', 'Syif'], ['kelas', 'syif'],
      ['Dikecualikan', 'Bercuti'], ['dikecualikan', 'bercuti'],
    ]),
  },
}

/** Rewrites interface text into the current purpose's vocabulary. */
export function applyTerms(text: string, lang: 'en' | 'ms'): string {
  const rules = TERMS[lang][purpose]
  if (!rules) return text
  let out = text
  for (const [pattern, to] of rules) out = out.replace(pattern, to)
  return out
}
