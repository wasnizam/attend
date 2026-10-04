/**
 * Real PDF files for the reports, made in the browser and downloaded straight away (no print
 * window). Everything is drawn as vector text and shapes, so the layout is the same on any screen,
 * charts stay sharp when zoomed, and the file is small. The library loads only on download.
 */
import type { jsPDF as JsPDF } from 'jspdf'

export interface PdfTable {
  head: string[]
  /** Right-align every column after the first `left` ones. */
  left?: number
  groups: { name: string; rows: string[][]; total?: string[] }[]
  total?: string[]
  /** Smaller text, for wide tables like the day-by-day grid. */
  compact?: boolean
}

export interface PdfTrend {
  title: string
  note?: string
  labels: string[]
  series: { label: string; color: string; values: number[] }[]
}

export interface PdfBars {
  title: string
  note?: string
  items: { label: string; value: number; display: string; note?: string }[]
  max: number
}

export type PdfSection = { heading: string; note?: string; newPage?: boolean } & ({ table: PdfTable } | { lines: [string, string][] })

export interface PdfReport {
  fileName: string
  title: string
  period: string
  organisation?: string
  /** Who and what the report covers: filters, prepared by, generated on. */
  meta: [string, string][]
  kpis: { label: string; value: string; note?: string; warn?: boolean }[]
  findings?: { heading: string; items: string[] }
  trend?: PdfTrend
  bars?: PdfBars[]
  sections: PdfSection[]
  notes?: { heading: string; items: string[] }
  /** Lines to sign at the end (a timesheet). */
  signatures?: string[]
  footer: string
  /** "{n} more in the table", in the reader's language. */
  moreLabel?: string
}

type RGB = [number, number, number]
const INK: RGB = [15, 23, 42]
const BODY: RGB = [51, 65, 85]
const MUTED: RGB = [100, 116, 139]
const LINE: RGB = [226, 232, 240]
const SOFT: RGB = [248, 250, 252]
const BAND: RGB = [241, 245, 249]
const ACCENT: RGB = [79, 70, 229]
const WARN: RGB = [178, 94, 0]

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

/** jsPDF's built-in font has no curly quotes, dashes or symbols: swap them for plain ones. */
const plain = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/·/g, '-')
    .replace(/✓/g, 'P')
    .replace(/½/g, 'H')
    .replace(/[^\x20-\x7E\n]/g, '')

const W = 297
const H = 210
const M = 14
const CONTENT = W - 2 * M
const BOTTOM = H - 16

export async function downloadReportPdf(report: PdfReport) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
  doc.setProperties({ title: plain(`${report.title} - ${report.period}`), subject: plain(report.organisation ?? ''), creator: 'Attend' })
  let y = coverHeader(doc, report)

  const newPage = () => {
    doc.addPage()
    y = 22
  }
  const room = (need: number) => {
    if (y + need > BOTTOM) newPage()
  }

  // Headline figures.
  y = kpiRow(doc, report.kpis, y) + 7

  // Trend beside the key findings, then the two bar charts side by side.
  if (report.trend || report.findings) {
    const trendW = report.findings ? CONTENT * 0.62 : CONTENT
    // As tall as the findings need, never shorter than the chart wants.
    const h = Math.max(56, report.findings ? findingsHeight(doc, report.findings, report.trend ? CONTENT - trendW - 6 : CONTENT) : 0)
    room(h)
    if (report.trend) trendChart(doc, report.trend, M, y, trendW, h)
    if (report.findings) findingsBox(doc, report.findings, report.trend ? M + trendW + 6 : M, y, report.trend ? CONTENT - trendW - 6 : CONTENT, h)
    y += h + 7
  }
  const bars = report.bars ?? []
  if (bars.length) {
    // Keep the charts on this page when at least three rows fit: show the first rows (lowest first) and say so.
    const fit = Math.floor((BOTTOM - y - 19 - 3) / ROW)
    if (Math.max(...bars.map(barsHeight)) > BOTTOM - y && fit >= 3) {
      for (const b of bars) {
        if (b.items.length > fit) {
          b.note = `${b.note ? `${b.note} ` : ''}(${(report.moreLabel ?? '{n} more in the table').replace('{n}', String(b.items.length - fit))})`
          b.items = b.items.slice(0, fit)
        }
      }
    }
    const h = Math.max(...bars.map(barsHeight))
    room(h)
    const w = bars.length > 1 ? (CONTENT - 6) / 2 : CONTENT
    bars.forEach((b, i) => barsChart(doc, b, M + i * (w + 6), y, w, h))
    y += h + 8
  }

  for (const section of report.sections) {
    if (section.newPage) newPage()
    room(30)
    y = sectionHeading(doc, section.heading, section.note, y)
    const common = {
      startY: y,
      margin: { left: M, right: M, top: 22, bottom: H - BOTTOM + 2 },
      rowPageBreak: 'avoid' as const,
    }
    if ('lines' in section) {
      autoTable(doc, {
        ...common,
        body: section.lines.map(([a, b]) => [plain(a), plain(b)]),
        theme: 'plain',
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 2, bottom: 2, left: 2.5, right: 2.5 }, textColor: BODY, lineColor: LINE, lineWidth: { bottom: 0.2 } },
        columnStyles: { 0: { fontStyle: 'bold', textColor: INK }, 1: { textColor: WARN, halign: 'right' } },
        alternateRowStyles: { fillColor: SOFT },
      })
    } else {
      const tb = section.table
      const left = tb.left ?? 2
      const groupStyle = { fontStyle: 'bold' as const, fillColor: BAND, textColor: INK }
      const body: { content: string; colSpan?: number; styles?: object }[][] = []
      for (const g of tb.groups) {
        if (g.name) {
          body.push(
            g.total
              ? [{ content: plain(g.name), colSpan: left, styles: groupStyle }, ...g.total.slice(left).map((c) => ({ content: plain(c), styles: groupStyle }))]
              : [{ content: plain(g.name), colSpan: tb.head.length, styles: groupStyle }],
          )
        }
        for (const r of g.rows) body.push(r.map((c) => ({ content: plain(c) })))
      }
      const totalStyle = { fontStyle: 'bold' as const, fillColor: INK, textColor: 255 }
      if (tb.total) body.push([{ content: plain(tb.total[0]), colSpan: left, styles: totalStyle }, ...tb.total.slice(left).map((c) => ({ content: plain(c), styles: totalStyle }))])
      autoTable(doc, {
        ...common,
        head: [tb.head.map(plain)],
        body,
        theme: 'plain',
        styles: {
          font: 'helvetica',
          fontSize: tb.compact ? 6.5 : 8,
          cellPadding: tb.compact ? 1 : { top: 1.8, bottom: 1.8, left: 2, right: 2 },
          textColor: BODY,
          lineColor: LINE,
          lineWidth: { bottom: 0.2 },
          valign: 'top',
          halign: tb.compact ? 'center' : 'left',
        },
        headStyles: { fillColor: ACCENT, textColor: 255, fontStyle: 'bold', fontSize: tb.compact ? 6.5 : 7.5, valign: 'middle' },
        columnStyles: Object.fromEntries(tb.head.map((_, i) => [i, i < left ? { halign: 'left' } : { halign: tb.compact ? 'center' : 'right' }])),
        didParseCell: (cell) => {
          // Column titles line up with the figures under them.
          if (cell.section === 'head') cell.cell.styles.halign = cell.column.index < left ? 'left' : tb.compact ? 'center' : 'right'
          // Colour the grid letters the way the screen does: absent red, late amber.
          if (!tb.compact || cell.section !== 'body' || cell.column.index < left) return
          const v = cell.cell.text.join(' ')
          if (/\bA\b/.test(v)) cell.cell.styles.textColor = [185, 28, 28]
          else if (/\bL\b/.test(v)) cell.cell.styles.textColor = WARN
        },
      })
    }
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9
  }

  if (report.notes?.items.length) {
    const notes = report.notes
    doc.setFont('helvetica', 'normal').setFontSize(7.5)
    const lines = notes.items.map((n) => doc.splitTextToSize(plain(n), CONTENT - 6) as string[])
    const h = 10 + lines.reduce((a, l) => a + l.length * 3.3 + 1.5, 0)
    room(h)
    doc.setFillColor(...SOFT).setDrawColor(...LINE).setLineWidth(0.25).roundedRect(M, y, CONTENT, h, 1.5, 1.5, 'FD')
    doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...INK).text(plain(notes.heading).toUpperCase(), M + 3, y + 5.5, { charSpace: 0.3 })
    let ny = y + 10.5
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED)
    for (const l of lines) {
      doc.text(l, M + 3, ny)
      ny += l.length * 3.3 + 1.5
    }
    y += h + 6
  }

  if (report.signatures?.length) {
    room(36)
    y += 22
    report.signatures.forEach((label, i) => {
      const x = M + i * 100
      doc.setDrawColor(...INK).setLineWidth(0.3).line(x, y, x + 80, y)
      doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...INK).text(plain(label), x, y + 5)
      doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED).text('Date:', x, y + 10.5)
    })
  }

  runningHeadersAndFooters(doc, report)
  doc.save(`${report.fileName}.pdf`)
}

/** First page: accent rule, company, title, period, and who/what the report covers. */
function coverHeader(doc: JsPDF, r: PdfReport) {
  doc.setFillColor(...ACCENT).rect(0, 0, W, 3, 'F')
  let y = 16
  if (r.organisation) {
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...ACCENT).text(plain(r.organisation).toUpperCase(), M, y, { charSpace: 0.4 })
    y += 8.5
  }
  doc.setFont('helvetica', 'bold').setFontSize(21).setTextColor(...INK).text(plain(r.title), M, y)
  doc.setFont('helvetica', 'normal').setFontSize(10.5).setTextColor(...BODY).text(plain(r.period), M, y + 6.5)
  // Who and what, on the right: label over value.
  const colW = 44
  const metaX = W - M - r.meta.length * colW
  r.meta.forEach(([label, value], i) => {
    const x = metaX + i * colW
    doc.setFont('helvetica', 'normal').setFontSize(6.8).setTextColor(...MUTED).text(plain(label).toUpperCase(), x, 16, { charSpace: 0.3 })
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...INK)
    doc.text((doc.splitTextToSize(plain(value), colW - 4) as string[]).slice(0, 2), x, 21)
  })
  y += 12
  doc.setDrawColor(...LINE).setLineWidth(0.3).line(M, y, W - M, y)
  return y + 6
}

function kpiRow(doc: JsPDF, kpis: PdfReport['kpis'], y: number) {
  if (!kpis.length) return y
  const gap = 4
  const w = (CONTENT - gap * (kpis.length - 1)) / kpis.length
  const h = 22
  kpis.forEach((k, i) => {
    const x = M + i * (w + gap)
    doc.setFillColor(...SOFT).setDrawColor(...LINE).setLineWidth(0.25).roundedRect(x, y, w, h, 1.8, 1.8, 'FD')
    doc.setFillColor(...(k.warn ? WARN : ACCENT)).rect(x, y + 3.5, 0.9, h - 7, 'F')
    doc.setFont('helvetica', 'normal').setFontSize(6.8).setTextColor(...MUTED).text(plain(k.label).toUpperCase(), x + 4.5, y + 6.5, { charSpace: 0.25 })
    doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...(k.warn ? WARN : INK)).text(plain(k.value), x + 4.5, y + 14)
    if (k.note) {
      doc.setFont('helvetica', 'normal').setFontSize(6.8).setTextColor(...MUTED)
      doc.text((doc.splitTextToSize(plain(k.note), w - 7) as string[])[0], x + 4.5, y + 19)
    }
  })
  return y + h
}

function panel(doc: JsPDF, x: number, y: number, w: number, h: number, title: string, note?: string) {
  doc.setFillColor(255, 255, 255).setDrawColor(...LINE).setLineWidth(0.25).roundedRect(x, y, w, h, 1.8, 1.8, 'FD')
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...INK).text(plain(title), x + 5, y + 7.5)
  if (note) {
    doc.setFont('helvetica', 'normal').setFontSize(7.2).setTextColor(...MUTED)
    doc.text((doc.splitTextToSize(plain(note), w - 10) as string[])[0], x + 5, y + 12)
  }
  return y + (note ? 17 : 12)
}

/** A round step for the axis: 1, 2 or 5 times a power of ten. */
const niceStep = (max: number) => {
  if (max <= 4) return 1
  const p = 10 ** Math.floor(Math.log10(max / 2))
  return [1, 2, 5, 10].map((m) => m * p).find((s) => max / s <= 5) ?? 10 * p
}

/** Stacked columns with a recessive grid, axis labels thinned out and a legend underneath. */
function trendChart(doc: JsPDF, c: PdfTrend, x: number, y: number, w: number, h: number) {
  const top = panel(doc, x, y, w, h, c.title, c.note)
  const n = c.labels.length
  const totals = c.labels.map((_, i) => c.series.reduce((a, s) => a + s.values[i], 0))
  const raw = Math.max(1, ...totals)
  const step = niceStep(raw)
  const max = Math.ceil(raw / step) * step
  const left = x + 13
  const right = x + w - 6
  const bottom = y + h - 15
  const plotH = bottom - (top + 2)
  const yy = (v: number) => bottom - (v / max) * plotH
  doc.setFont('helvetica', 'normal').setFontSize(6.5)
  for (let v = 0; v <= max; v += step) {
    doc.setDrawColor(...(v === 0 ? ([203, 213, 225] as RGB) : LINE)).setLineWidth(v === 0 ? 0.3 : 0.15).line(left, yy(v), right, yy(v))
    doc.setTextColor(...MUTED).text(String(v), left - 2, yy(v) + 1, { align: 'right' })
  }
  const slot = (right - left) / Math.max(1, n)
  const bar = Math.max(0.8, Math.min(8, slot * 0.62))
  const every = Math.ceil(n / 16)
  c.labels.forEach((label, i) => {
    const cx = left + slot * i + slot / 2
    let acc = 0
    const parts = c.series.filter((s) => s.values[i] > 0)
    parts.forEach((s, j) => {
      const v = s.values[i]
      const t = yy(acc + v)
      const b = yy(acc)
      acc += v
      // A thin white gap between stacked parts.
      const gap = j === parts.length - 1 ? 0 : 0.4
      doc.setFillColor(...hex(s.color)).rect(cx - bar / 2, t + gap, bar, Math.max(0.1, b - t - gap), 'F')
    })
    if (i % every === 0) doc.setTextColor(...MUTED).text(plain(label), cx, bottom + 4, { align: 'center' })
  })
  if (totals.every((v) => v === 0)) doc.setFontSize(8).setTextColor(...MUTED).text('-', (left + right) / 2, (top + bottom) / 2, { align: 'center' })
  let lx = left
  doc.setFontSize(7)
  for (const s of c.series) {
    doc.setFillColor(...hex(s.color)).roundedRect(lx, y + h - 7.8, 2.6, 2.6, 0.4, 0.4, 'F')
    doc.setTextColor(...BODY).text(plain(s.label), lx + 4, y + h - 5.6)
    lx += 4 + doc.getTextWidth(plain(s.label)) + 6
  }
}

const findingsHeight = (doc: JsPDF, f: NonNullable<PdfReport['findings']>, w: number) => {
  doc.setFont('helvetica', 'normal').setFontSize(8.2)
  return 15 + f.items.reduce((a, item) => a + (doc.splitTextToSize(plain(item), w - 15) as string[]).length * 3.8 + 2.2, 0)
}

function findingsBox(doc: JsPDF, f: NonNullable<PdfReport['findings']>, x: number, y: number, w: number, h: number) {
  doc.setFillColor(...SOFT).setDrawColor(...LINE).setLineWidth(0.25).roundedRect(x, y, w, h, 1.8, 1.8, 'FD')
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...INK).text(plain(f.heading), x + 5, y + 7.5)
  let ty = y + 15
  doc.setFont('helvetica', 'normal').setFontSize(8.2)
  for (const item of f.items) {
    const lines = doc.splitTextToSize(plain(item), w - 15) as string[]
    if (ty + (lines.length - 1) * 3.8 > y + h - 4) break
    doc.setFillColor(...ACCENT).circle(x + 6.3, ty - 1.1, 0.8, 'F')
    doc.setTextColor(...BODY).text(lines, x + 9.5, ty)
    ty += lines.length * 3.8 + 2.2
  }
}

const ROW = 5.4
const barsHeight = (b: PdfBars) => 19 + Math.min(8, b.items.length) * ROW

/** Horizontal bars, value written at the end, one row per group or person. */
function barsChart(doc: JsPDF, b: PdfBars, x: number, y: number, w: number, h: number) {
  let ty = panel(doc, x, y, w, h, b.title, b.note) + 1.5
  const labelW = Math.min(66, w * 0.46)
  const valueW = 30
  const trackX = x + 5 + labelW
  const trackW = w - 10 - labelW - valueW
  for (const it of b.items.slice(0, 8)) {
    doc.setFont('helvetica', 'normal').setFontSize(7.8).setTextColor(...BODY)
    doc.text((doc.splitTextToSize(plain(it.label), labelW - 3) as string[])[0], x + 5, ty + 2.4)
    doc.setFillColor(...BAND).roundedRect(trackX, ty, trackW, 3, 1.5, 1.5, 'F')
    const fill = b.max && it.value ? Math.max(3, (it.value / b.max) * trackW) : 0
    if (fill) doc.setFillColor(...ACCENT).roundedRect(trackX, ty, fill, 3, 1.5, 1.5, 'F')
    // Value, then its note in grey on the same line: "50%   1 late".
    doc.setFont('helvetica', 'normal').setFontSize(6.8).setTextColor(...MUTED)
    const noteW = it.note ? doc.getTextWidth(plain(it.note)) : 0
    if (it.note) doc.text(plain(it.note), x + w - 5, ty + 2.4, { align: 'right' })
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...INK).text(plain(it.display), x + w - 5 - (noteW ? noteW + 2.5 : 0), ty + 2.4, { align: 'right' })
    ty += ROW
  }
}

function sectionHeading(doc: JsPDF, heading: string, note: string | undefined, y: number) {
  doc.setFillColor(...ACCENT).rect(M, y, 1.2, 5.2, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(11.5).setTextColor(...INK).text(plain(heading), M + 4, y + 4.3)
  y += 8
  if (note) {
    doc.setFont('helvetica', 'normal').setFontSize(7.8).setTextColor(...MUTED)
    const lines = doc.splitTextToSize(plain(note), CONTENT) as string[]
    doc.text(lines, M, y + 1.5)
    y += lines.length * 3.4 + 2
  }
  return y + 1
}

/** From page 2 a slim running header; on every page the footer with page numbers. */
function runningHeadersAndFooters(doc: JsPDF, r: PdfReport) {
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    if (i > 1) {
      doc.setFillColor(...ACCENT).rect(0, 0, W, 1.5, 'F')
      doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...INK).text(plain(`${r.title} - ${r.period}`), M, 11)
      if (r.organisation) doc.setFont('helvetica', 'normal').setTextColor(...MUTED).text(plain(r.organisation), W - M, 11, { align: 'right' })
      doc.setDrawColor(...LINE).setLineWidth(0.25).line(M, 14, W - M, 14)
    }
    doc.setDrawColor(...LINE).setLineWidth(0.25).line(M, H - 11, W - M, H - 11)
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED).text(plain(r.footer), M, H - 6.5)
    doc.text(`Page ${i} of ${pages}`, W - M, H - 6.5, { align: 'right' })
  }
}
