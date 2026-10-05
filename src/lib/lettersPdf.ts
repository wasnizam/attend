/**
 * Warning letters and barring lists for the university attendance rule, as real PDF files made
 * in the browser. The letter text is the lecturer's own (with {placeholders} filled in per
 * student), because every university words these letters its own way.
 */
import { formatDate } from './format'
import type { ClassReport, StudentRow } from './report'
import type { WeeklyClass } from './types'

export type LetterKind = 'warning' | 'barring'

export interface LetterTemplate {
  subject: string
  body: string
}

/** The words a template can use, shown to the lecturer next to the text box. */
export const PLACEHOLDERS = ['{student}', '{id}', '{course}', '{code}', '{section}', '{absent}', '{held}', '{rate}', '{required}', '{canMiss}', '{nextStep}', '{lecturer}', '{date}']

export const DEFAULT_LETTERS: Record<'en' | 'ms', Record<LetterKind, LetterTemplate>> = {
  en: {
    warning: {
      subject: 'Attendance warning: {course}',
      body: `Dear {student} ({id}),

Our records show that you have been absent without a reason from {absent} of the {held} classes of {course} held so far this semester. Your attendance is now {rate}.

Students must attend at least {required}% of classes to sit the final examination. {nextStep}

Please attend all remaining classes. If you missed a class for a valid reason, such as a medical certificate, see me as soon as possible with the evidence.

Yours sincerely,`,
    },
    barring: {
      subject: 'Barred from the final examination: {course}',
      body: `Dear {student} ({id}),

You have been absent without a reason from {absent} of the {held} classes of {course}, so your attendance can no longer reach the required {required}%. Under the attendance rules, you are barred from the final examination for this course.

If you believe this record is wrong, or you have evidence for absences you have not yet submitted, contact me within 7 days of the date of this letter.

Yours sincerely,`,
    },
  },
  ms: {
    warning: {
      subject: 'Amaran kehadiran: {course}',
      body: `Kepada {student} ({id}),

Rekod kami menunjukkan anda tidak hadir tanpa sebab bagi {absent} daripada {held} kelas {course} yang telah diadakan semester ini. Kehadiran anda kini {rate}.

Pelajar mesti hadir sekurang-kurangnya {required}% kelas untuk menduduki peperiksaan akhir. {nextStep}

Sila hadir ke semua kelas yang berbaki. Jika anda tidak hadir atas sebab yang sah, seperti sijil cuti sakit, sila jumpa saya segera bersama bukti.

Yang benar,`,
    },
    barring: {
      subject: 'Dihalang daripada peperiksaan akhir: {course}',
      body: `Kepada {student} ({id}),

Anda tidak hadir tanpa sebab bagi {absent} daripada {held} kelas {course}, maka kehadiran anda tidak lagi boleh mencapai {required}% yang diwajibkan. Mengikut peraturan kehadiran, anda dihalang daripada menduduki peperiksaan akhir kursus ini.

Jika anda percaya rekod ini salah, atau anda mempunyai bukti bagi ketidakhadiran yang belum dihantar, sila hubungi saya dalam tempoh 7 hari dari tarikh surat ini.

Yang benar,`,
    },
  },
}

const KEY = 'attend.letters'

export function loadLetters(lang: 'en' | 'ms'): Record<LetterKind, LetterTemplate> {
  try {
    const saved = JSON.parse(localStorage.getItem(`${KEY}.${lang}`) ?? 'null') as Partial<Record<LetterKind, LetterTemplate>> | null
    return { ...DEFAULT_LETTERS[lang], ...(saved ?? {}) }
  } catch {
    return DEFAULT_LETTERS[lang]
  }
}

export function saveLetters(lang: 'en' | 'ms', letters: Record<LetterKind, LetterTemplate>) {
  try {
    localStorage.setItem(`${KEY}.${lang}`, JSON.stringify(letters))
  } catch {
    // Not remembered on this device; the letters are still made.
  }
}

export interface LetterContext {
  cls: Pick<WeeklyClass, 'name' | 'code' | 'section'>
  report: ClassReport
  lecturer: string
  /** The letterhead: the university or faculty name. */
  institution: string
  /** The date printed on the letters, YYYY-MM-DD. */
  date: string
}

const pct = (rate: number | null) => (rate === null ? '—' : `${rate.toFixed(1)}%`)

/** The template with this student's figures put in. */
/** What happens next, in a sentence that reads well for 0, 1 or many classes. */
export function nextStep(canMiss: number, lang: 'en' | 'ms'): string {
  if (lang === 'ms') return canMiss === 0 ? 'Satu lagi ketidakhadiran tanpa sebab akan menyebabkan anda dihalang daripada peperiksaan akhir.' : `Anda hanya boleh tidak hadir tanpa sebab ${canMiss} kelas lagi sebelum dihalang.`
  return canMiss === 0
    ? 'One more absence without a reason will bar you from the final examination.'
    : `You can miss no more than ${canMiss} more ${canMiss === 1 ? 'class' : 'classes'} without a reason before you are barred.`
}

export function fill(text: string, row: StudentRow, ctx: LetterContext, lang: 'en' | 'ms' = 'en'): string {
  const course = [ctx.cls.code, ctx.cls.name].filter(Boolean).join(' ')
  const values: Record<string, string> = {
    student: row.studentName,
    id: row.studentId,
    course,
    code: ctx.cls.code ?? '',
    section: ctx.cls.section ?? '',
    absent: String(row.absent),
    held: String(ctx.report.held.length),
    rate: pct(row.rate),
    required: String(ctx.report.required),
    canMiss: String(row.canMiss),
    nextStep: nextStep(row.canMiss, lang),
    lecturer: ctx.lecturer,
    date: formatDate(ctx.date),
  }
  return text.replace(/\{(\w+)\}/g, (all, key: string) => values[key] ?? all)
}

/** The dates a student was absent without a reason. */
export const absentDates = (row: StudentRow, report: ClassReport) => report.held.filter((s) => !row.marks.has(s.id)).map((s) => formatDate(s.date))

async function pdf() {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  return { doc: new jsPDF({ unit: 'mm', format: 'a4' }), autoTable }
}

const INK: [number, number, number] = [15, 23, 42]
const MUTED: [number, number, number] = [100, 116, 139]
const NIGHT: [number, number, number] = [22, 18, 63]

/** One letter per page, for every chosen student. */
export async function lettersPdf(rows: StudentRow[], template: LetterTemplate, ctx: LetterContext, lang: 'en' | 'ms', labels: { absentOn: string; date: string; course: string; section: string; generated: string }) {
  const { doc, autoTable } = await pdf()
  const W = 210
  const M = 22
  rows.forEach((row, i) => {
    if (i) doc.addPage()
    // Letterhead.
    doc.setFillColor(...NIGHT)
    doc.rect(0, 0, W, 4, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(...INK)
    doc.text(ctx.institution || ctx.cls.name, M, 20)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    const sub = [ctx.cls.code && `${labels.course}: ${ctx.cls.code}`, ctx.cls.section && `${labels.section}: ${ctx.cls.section}`].filter(Boolean).join('   ')
    if (sub) doc.text(sub, M, 26)
    doc.text(`${labels.date}: ${formatDate(ctx.date)}`, W - M, 20, { align: 'right' })
    doc.setDrawColor(226, 232, 240)
    doc.line(M, 31, W - M, 31)

    // Subject and body.
    let y = 42
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...INK)
    for (const line of doc.splitTextToSize(fill(template.subject, row, ctx, lang), W - 2 * M) as string[]) {
      doc.text(line, M, y)
      y += 6
    }
    y += 4
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10.5)
    for (const para of fill(template.body, row, ctx, lang).split('\n')) {
      if (!para.trim()) {
        y += 3
        continue
      }
      for (const line of doc.splitTextToSize(para, W - 2 * M) as string[]) {
        doc.text(line, M, y)
        y += 5.2
      }
    }

    // Signature.
    y += 16
    doc.setDrawColor(...MUTED)
    doc.line(M, y, M + 60, y)
    doc.setFont('helvetica', 'bold')
    doc.text(ctx.lecturer, M, y + 6)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text([ctx.cls.code, ctx.cls.name].filter(Boolean).join(' '), M, y + 11)

    // The record behind the letter.
    const dates = absentDates(row, ctx.report)
    if (dates.length) {
      autoTable(doc, {
        startY: y + 20,
        margin: { left: M, right: M },
        head: [[labels.absentOn]],
        body: chunk(dates, 4).map((r) => [r.join('     ')]),
        theme: 'plain',
        styles: { fontSize: 8.5, textColor: INK, cellPadding: 1.6 },
        headStyles: { fontStyle: 'bold', textColor: MUTED, fillColor: [248, 250, 252] },
      })
    }
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    doc.text(labels.generated, M, 287)
  })
  return doc
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/** The list for the faculty: everyone due barring (and, below, everyone due a warning), with lines to sign. */
export async function barringListPdf(
  ctx: LetterContext,
  labels: {
    title: string
    barring: string
    warning: string
    none: string
    head: string[]
    held: string
    required: string
    lecturer: string
    hod: string
    generated: string
    date: string
  },
) {
  const { doc, autoTable } = await pdf()
  const W = 210
  const M = 18
  doc.setFillColor(...NIGHT)
  doc.rect(0, 0, W, 4, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(...INK)
  doc.text(labels.title, M, 18)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...MUTED)
  const meta = [
    ctx.institution,
    [ctx.cls.code, ctx.cls.name, ctx.cls.section && `(${ctx.cls.section})`].filter(Boolean).join(' '),
    `${labels.lecturer}: ${ctx.lecturer}`,
    `${labels.held}: ${ctx.report.held.length}${ctx.report.planned > ctx.report.held.length ? ` / ${ctx.report.planned}` : ''}   ·   ${labels.required}: ${ctx.report.required}%   ·   ${labels.date}: ${formatDate(ctx.date)}`,
  ].filter(Boolean)
  meta.forEach((line, i) => doc.text(line, M, 25 + i * 5))
  let y = 25 + meta.length * 5 + 6

  const table = (heading: string, rows: StudentRow[], colour: [number, number, number]) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...colour)
    doc.text(`${heading} (${rows.length})`, M, y)
    autoTable(doc, {
      startY: y + 3,
      margin: { left: M, right: M },
      head: [labels.head],
      body: rows.length ? rows.map((r, i) => [String(i + 1), r.studentId, r.studentName, String(r.absent), pct(r.rate)]) : [[{ content: labels.none, colSpan: 5 }]],
      theme: 'grid',
      styles: { fontSize: 9, textColor: INK, lineColor: [226, 232, 240], cellPadding: 2 },
      headStyles: { fillColor: NIGHT, textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 10 }, 3: { halign: 'right', cellWidth: 22 }, 4: { halign: 'right', cellWidth: 26 } },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
  }
  table(labels.barring, ctx.report.rows.filter((r) => r.level === 'barring'), [185, 28, 28])
  table(labels.warning, ctx.report.rows.filter((r) => r.level === 'warning'), [146, 64, 14])

  if (y > 255) {
    doc.addPage()
    y = 30
  }
  y += 12
  doc.setDrawColor(...MUTED)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...INK)
  ;[labels.lecturer, labels.hod].forEach((who, i) => {
    const x = M + i * 92
    doc.line(x, y, x + 72, y)
    doc.text(who, x, y + 5)
    doc.setTextColor(...MUTED)
    doc.text(`${labels.date}:`, x, y + 11)
    doc.setTextColor(...INK)
  })
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text(labels.generated, M, 287)
  return doc
}
