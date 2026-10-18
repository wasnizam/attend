/**
 * Certificates of attendance: issued by the server from the attendance records (see
 * api/certificate.ts), each with a public page anyone can open to check it is real, and a PDF
 * made here in the browser.
 */
import { auth } from './auth'
import { formatDate } from './format'
import { t } from './i18n'

export interface Certificate {
  code: string
  name: string
  course: string
  issuer: string
  signedBy: string
  /** First and last day attended, YYYY-MM-DD. */
  from: string
  to: string
  hours: number
  sessions: number
  rate: number | null
  issuedAt: number
  revoked: boolean
  /** Only in the organiser's own list: who it belongs to in their records. */
  key?: string
}

export type CertificateSource = { kind: 'class' | 'session'; id: string }

async function call<T>(body: object): Promise<T> {
  const token = await auth.currentUser?.getIdToken()
  let res: Response
  try {
    res = await fetch('/api/certificate', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token ?? ''}` }, body: JSON.stringify(body) })
  } catch {
    throw new Error(t('Dobry could not be reached. Check your connection and try again.'))
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(data.error ? t(data.error) : t('Certificates are not available right now. Please try again later.'))
  return data as T
}

export const listCertificates = (source: CertificateSource) => call<{ certificates: Certificate[] }>({ action: 'list', source }).then((r) => r.certificates)

export const issueCertificates = (source: CertificateSource, input: { keys: string[]; min: number; course: string; issuer: string; signedBy: string }) =>
  call<{ certificates: Certificate[]; skipped: number }>({ action: 'issue', source, ...input })

export const revokeCertificates = (source: CertificateSource, codes: string[]) => call<{ revoked: number }>({ action: 'revoke', source, codes })

/** Anyone: the certificate behind a code. Null when there is none. */
export async function fetchCertificate(code: string): Promise<Certificate | null> {
  const res = await fetch(`/api/certificate?code=${encodeURIComponent(code)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error('unavailable')
  return ((await res.json()) as { certificate: Certificate }).certificate
}

/** The public page that proves a certificate is real. */
export const certificateUrl = (code: string) => `${window.location.origin}/c/${code}`

/** The code as printed: two groups of four, easier to read out and type. */
export const prettyCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`

/** The days attended, as one line: "12 Oct 2026", or "12 Oct 2026 – 13 Oct 2026". */
export const dateLine = (c: Pick<Certificate, 'from' | 'to'>) => (!c.from ? '' : c.from === c.to || !c.to ? formatDate(c.from) : `${formatDate(c.from)} – ${formatDate(c.to)}`)

const hoursText = (h: number) => (Number.isInteger(h) ? String(h) : h.toFixed(1))

/** "14 hours · 4 sessions · 100% attendance" */
export function figuresLine(c: Pick<Certificate, 'hours' | 'sessions' | 'rate'>): string {
  return [
    c.hours > 0 && t(c.hours === 1 ? '1 hour' : '{n} hours', { n: hoursText(c.hours) }),
    t(c.sessions === 1 ? '1 session' : '{n} sessions', { n: c.sessions }),
    c.rate !== null && t('{n}% attendance', { n: c.rate }),
  ].filter(Boolean).join('  ·  ')
}

/**
 * LinkedIn's "Add to profile" form, filled in. The person checks it and saves it on LinkedIn;
 * nothing is sent to LinkedIn by Dobry.
 */
export function linkedInUrl(c: Certificate): string {
  const issued = new Date(c.to ? `${c.to}T12:00:00` : c.issuedAt)
  const q = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: c.course,
    organizationName: c.issuer,
    issueYear: String(issued.getFullYear()),
    issueMonth: String(issued.getMonth() + 1),
    certUrl: certificateUrl(c.code),
    certId: prettyCode(c.code),
  })
  return `https://www.linkedin.com/profile/add?${q}`
}

/** A QR code as a picture, for the PDF. Drawn by the same QR component the app already uses. */
async function qrPicture(text: string): Promise<string | null> {
  try {
    const [{ createElement }, { flushSync }, { createRoot }, { QRCodeCanvas }] = await Promise.all([import('react'), import('react-dom'), import('react-dom/client'), import('qrcode.react')])
    const box = document.createElement('div')
    const root = createRoot(box)
    flushSync(() => root.render(createElement(QRCodeCanvas, { value: text, size: 240, marginSize: 1, level: 'M' })))
    await new Promise((r) => setTimeout(r, 0))
    const url = box.querySelector('canvas')?.toDataURL('image/png') ?? null
    root.unmount()
    return url
  } catch {
    return null
  }
}

const NIGHT: [number, number, number] = [22, 18, 63]
const SUN: [number, number, number] = [255, 200, 61]
const INK: [number, number, number] = [15, 23, 42]
const MUTED: [number, number, number] = [100, 116, 139]

/** One certificate per page, landscape A4. */
export async function certificatesPdf(list: Certificate[]) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const W = 297
  const H = 210
  const C = W / 2
  for (const [i, c] of list.entries()) {
    if (i) doc.addPage()
    // Frame: a night-blue border with a thin sun-yellow line inside it.
    doc.setFillColor(...NIGHT)
    doc.rect(0, 0, W, H, 'F')
    doc.setFillColor(255, 255, 255)
    doc.rect(9, 9, W - 18, H - 18, 'F')
    doc.setDrawColor(...SUN)
    doc.setLineWidth(0.8)
    doc.rect(14, 14, W - 28, H - 28)

    doc.setTextColor(...MUTED)
    doc.setFont('helvetica', 'bold').setFontSize(10)
    doc.text(c.issuer.toUpperCase(), C, 34, { align: 'center', charSpace: 0.6 })

    doc.setTextColor(...NIGHT)
    doc.setFont('helvetica', 'bold').setFontSize(30)
    doc.text(t('Certificate of Attendance'), C, 52, { align: 'center' })

    doc.setTextColor(...MUTED)
    doc.setFont('helvetica', 'normal').setFontSize(12)
    doc.text(t('This is to certify that'), C, 68, { align: 'center' })

    doc.setTextColor(...INK)
    doc.setFont('helvetica', 'bold').setFontSize(c.name.length > 40 ? 22 : 28)
    doc.text(doc.splitTextToSize(c.name, W - 70)[0] as string, C, 84, { align: 'center' })
    doc.setDrawColor(...SUN)
    doc.setLineWidth(0.6)
    doc.line(C - 60, 89, C + 60, 89)

    doc.setTextColor(...MUTED)
    doc.setFont('helvetica', 'normal').setFontSize(12)
    doc.text(t('attended'), C, 100, { align: 'center' })

    doc.setTextColor(...INK)
    doc.setFont('helvetica', 'bold').setFontSize(18)
    const course = doc.splitTextToSize(c.course, W - 80) as string[]
    doc.text(course.slice(0, 2), C, 112, { align: 'center' })
    let y = 112 + Math.min(course.length, 2) * 8
    doc.setTextColor(...MUTED)
    doc.setFont('helvetica', 'normal').setFontSize(11)
    if (dateLine(c)) {
      doc.text(dateLine(c), C, y + 2, { align: 'center' })
      y += 7
    }
    doc.text(figuresLine(c), C, y + 2, { align: 'center' })

    // Signature on the left, the check on the right.
    const base = 172
    doc.setDrawColor(...MUTED)
    doc.setLineWidth(0.3)
    doc.line(34, base, 104, base)
    doc.setTextColor(...INK)
    doc.setFont('helvetica', 'bold').setFontSize(10.5)
    if (c.signedBy) doc.text(c.signedBy, 34, base + 6)
    doc.setTextColor(...MUTED)
    doc.setFont('helvetica', 'normal').setFontSize(9)
    doc.text(c.issuer, 34, base + (c.signedBy ? 11 : 6))

    const url = certificateUrl(c.code)
    const qr = await qrPicture(url)
    if (qr) doc.addImage(qr, 'PNG', W - 34 - 26, base - 22, 26, 26)
    doc.setFontSize(8.5)
    doc.text(t('Check it is real'), W - 34 - 30, base - 15, { align: 'right' })
    doc.setTextColor(...INK)
    doc.setFont('helvetica', 'bold').setFontSize(9)
    doc.text(url.replace(/^https?:\/\//, ''), W - 34 - 30, base - 10, { align: 'right' })
    doc.setFont('helvetica', 'normal').setTextColor(...MUTED).setFontSize(8.5)
    doc.text(`${t('Certificate no.')} ${prettyCode(c.code)}`, W - 34 - 30, base - 5, { align: 'right' })

    doc.setFontSize(8)
    doc.text(t('Issued with Dobry · dobry.app'), C, H - 19, { align: 'center' })
  }
  return doc
}
