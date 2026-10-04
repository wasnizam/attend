/**
 * Real PDF files for the reports, made in the browser and downloaded straight away (no print
 * window). Tables are text, so they stay sharp and searchable; charts are pictures of the page.
 * The libraries load only when someone downloads, so the app itself stays small.
 */

export interface PdfTable {
  head: string[]
  /** Right-align every column after the first `left` ones. */
  left?: number
  groups: { name: string; rows: string[][]; total?: string[] }[]
  total?: string[]
  /** Smaller text, for wide tables like the day-by-day grid. */
  compact?: boolean
}

export interface PdfReport {
  fileName: string
  title: string
  subtitle: string
  stats: [string, string][]
  /** Page parts to include as pictures, such as the charts. */
  pictures?: HTMLElement[]
  sections: ({ heading: string; note?: string } & ({ table: PdfTable } | { lines: [string, string][] }))[]
  notes?: string[]
  /** Lines to sign at the end (a timesheet). */
  signatures?: string[]
  footer: string
}

const INK: [number, number, number] = [15, 23, 42]
const MUTED: [number, number, number] = [100, 116, 139]
const LINE: [number, number, number] = [226, 232, 240]
const ACCENT: [number, number, number] = [79, 70, 229]
const WARN: [number, number, number] = [178, 94, 0]

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

export async function downloadReportPdf(report: PdfReport) {
  const [{ jsPDF }, { default: autoTable }, { toJpeg }] = await Promise.all([import('jspdf'), import('jspdf-autotable'), import('html-to-image')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 12
  let y = M

  const room = (need: number) => {
    if (y + need > H - M - 6) {
      doc.addPage()
      y = M
    }
  }

  // Title block.
  doc.setTextColor(...INK).setFont('helvetica', 'bold').setFontSize(16).text(plain(report.title), M, y + 5)
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED).text(plain(report.subtitle), M, y + 11)
  y += 17

  // Headline figures, as a row of boxes.
  if (report.stats.length) {
    const gap = 3
    const w = (W - 2 * M - gap * (report.stats.length - 1)) / report.stats.length
    report.stats.forEach(([label, value], i) => {
      const x = M + i * (w + gap)
      doc.setDrawColor(...LINE).setFillColor(248, 250, 252).roundedRect(x, y, w, 15, 1.5, 1.5, 'FD')
      doc.setFontSize(7.5).setTextColor(...MUTED).text(plain(label), x + 3, y + 5)
      doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK).text(plain(value), x + 3, y + 11.5)
      doc.setFont('helvetica', 'normal')
    })
    y += 21
  }

  // Charts, as pictures: the first across the page, the rest two to a row.
  const snap = async (el: HTMLElement) => ({
    // JPEG keeps the file small; a PNG of a chart this size is several megabytes.
    img: await toJpeg(el, { pixelRatio: 2, quality: 0.9, backgroundColor: '#ffffff', width: el.offsetWidth, height: el.offsetHeight, style: { margin: '0', boxShadow: 'none' } }),
    ratio: el.offsetHeight / el.offsetWidth,
  })
  const pics = await Promise.all((report.pictures ?? []).map(snap))
  const place = (pic: { img: string; ratio: number }, x: number, width: number, maxH: number) => {
    let w = width
    let h = w * pic.ratio
    if (h > maxH) {
      h = maxH
      w = h / pic.ratio
    }
    doc.addImage(pic.img, 'JPEG', x, y, w, h)
    return h
  }
  if (pics.length) {
    // Sized so the trend and the two smaller charts fit on the first page together.
    room(Math.min(68, (W - 2 * M) * pics[0].ratio))
    y += place(pics[0], M, W - 2 * M, 68) + 4
    for (let i = 1; i < pics.length; i += 2) {
      const half = (W - 2 * M - 4) / 2
      const pair = pics.slice(i, i + 2)
      const tallest = Math.min(64, Math.max(...pair.map((p) => half * p.ratio)))
      room(tallest)
      const hs = pair.map((p, j) => place(p, M + j * (half + 4), half, 64))
      y += Math.max(...hs) + 4
    }
    y += 2
  }

  for (const section of report.sections) {
    room(20)
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...INK).text(plain(section.heading), M, y + 4)
    doc.setFont('helvetica', 'normal')
    y += 6
    if (section.note) {
      const lines = doc.setFontSize(8).setTextColor(...MUTED).splitTextToSize(plain(section.note), W - 2 * M)
      doc.text(lines, M, y + 3)
      y += lines.length * 3.5 + 1
    }
    if ('lines' in section) {
      autoTable(doc, {
        startY: y + 1,
        rowPageBreak: 'avoid',
        margin: { left: M, right: M },
        body: section.lines.map(([a, b]) => [plain(a), plain(b)]),
        theme: 'plain',
        styles: { fontSize: 8.5, cellPadding: 1.4, textColor: INK, lineColor: LINE, lineWidth: { bottom: 0.2 } },
        columnStyles: { 1: { textColor: WARN, halign: 'right' } },
      })
    } else {
      const tb = section.table
      const left = tb.left ?? 2
      const body: { content: string; styles?: object }[][] = []
      for (const g of tb.groups) {
        if (g.name) {
          body.push([
            { content: plain(g.name), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
            ...Array.from({ length: tb.head.length - 1 }, (_, i) => ({ content: plain(g.total?.[i + 1] ?? ''), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } })),
          ])
        }
        for (const r of g.rows) body.push(r.map((c) => ({ content: plain(c) })))
      }
      if (tb.total) body.push(tb.total.map((c) => ({ content: plain(c), styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } })))
      autoTable(doc, {
        startY: y + 1,
        rowPageBreak: 'avoid',
        margin: { left: M, right: M, bottom: M + 6 },
        head: [tb.head.map(plain)],
        body,
        theme: 'grid',
        styles: { fontSize: tb.compact ? 6 : 8, cellPadding: tb.compact ? 0.8 : 1.6, textColor: INK, lineColor: LINE, lineWidth: 0.2, valign: 'top', halign: tb.compact ? 'center' : 'left' },
        headStyles: { fillColor: ACCENT, textColor: 255, fontStyle: 'bold' },
        columnStyles: Object.fromEntries(tb.head.map((_, i) => [i, i < left ? { halign: 'left' } : { halign: tb.compact ? 'center' : 'right' }])),
      })
    }
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7
  }

  for (const note of report.notes ?? []) {
    const lines = doc.setFontSize(7.5).setTextColor(...MUTED).splitTextToSize(plain(note), W - 2 * M)
    room(lines.length * 3.4 + 2)
    doc.text(lines, M, y)
    y += lines.length * 3.4 + 2
  }

  if (report.signatures?.length) {
    room(28)
    y += 18
    report.signatures.forEach((label, i) => {
      const x = M + i * 95
      doc.setDrawColor(...INK).line(x, y, x + 75, y)
      doc.setFontSize(8.5).setTextColor(...INK).text(plain(label), x, y + 5)
    })
  }

  // Page numbers and where it came from, on every page.
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(7).setTextColor(...MUTED)
    doc.text(plain(report.footer), M, H - 6)
    doc.text(`${i} / ${pages}`, W - M, H - 6, { align: 'right' })
  }

  doc.save(`${report.fileName}.pdf`)
}
