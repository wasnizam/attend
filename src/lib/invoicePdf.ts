import type { Invoice, PlatformSettings } from '../data/platform'

/** A tax invoice as a PDF, downloaded straight away. Drawn as text, so it prints sharp. */
export async function downloadInvoicePdf(inv: Invoice, seller: PlatformSettings) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const W = doc.internal.pageSize.getWidth()
  const M = 18
  const plain = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\x20-\x7E\n]/g, '')
  const cur = inv.currency === 'USD' ? 'US$' : 'RM'
  const amt = (n: number) => `${cur} ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const ink: [number, number, number] = [15, 23, 42]
  const muted: [number, number, number] = [100, 116, 139]
  const accent: [number, number, number] = [79, 70, 229]

  doc.setFillColor(...accent).rect(0, 0, W, 3, 'F')
  // Seller, top left.
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...ink).text(plain(seller.companyName || 'Attend'), M, 20)
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...muted)
  const sellerLines = [seller.regNo && `Reg. no. ${seller.regNo}`, ...plain(seller.address).split('\n'), seller.email, seller.phone, seller.sstNo && `SST reg. no. ${seller.sstNo}`].filter(Boolean) as string[]
  doc.text(sellerLines.map(plain), M, 26)
  // Title and number, top right.
  const title = inv.taxRate > 0 ? 'TAX INVOICE' : 'INVOICE'
  doc.setFont('helvetica', 'bold').setFontSize(20).setTextColor(...ink).text(title, W - M, 20, { align: 'right' })
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...muted)
  const meta: [string, string][] = [
    ['Invoice no.', inv.number],
    ['Date', inv.issueDate],
    ['Due', inv.dueDate],
    ['Status', inv.status === 'paid' ? 'PAID' : inv.status === 'void' ? 'VOID' : 'UNPAID'],
  ]
  meta.forEach(([k, v], i) => {
    doc.setTextColor(...muted).text(k, W - M - 45, 28 + i * 5)
    doc.setTextColor(...ink).setFont('helvetica', 'bold').text(plain(v), W - M, 28 + i * 5, { align: 'right' })
    doc.setFont('helvetica', 'normal')
  })
  // Bill to.
  let y = Math.max(28 + sellerLines.length * 3.8, 52) + 8
  doc.setFontSize(8).setTextColor(...muted).text('BILL TO', M, y)
  doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...ink).text(plain(inv.billTo.name), M, y + 5.5)
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...muted)
  doc.text([inv.billTo.email, ...(inv.billTo.address ? plain(inv.billTo.address).split('\n') : [])].map(plain), M, y + 10.5)
  y += 22 + (inv.billTo.address ? inv.billTo.address.split('\n').length * 4 : 0)

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['Description', 'Qty', 'Unit price', 'Amount']],
    body: inv.items.map((i) => [plain(i.description), String(i.qty), amt(i.unitPrice), amt(i.qty * i.unitPrice)]),
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 }, textColor: ink, lineColor: [226, 232, 240], lineWidth: { bottom: 0.2 } },
    headStyles: { fillColor: [241, 245, 249], textColor: muted, fontStyle: 'bold', fontSize: 8 },
    columnStyles: { 1: { halign: 'right', cellWidth: 16 }, 2: { halign: 'right', cellWidth: 32 }, 3: { halign: 'right', cellWidth: 34 } },
    didParseCell: (c) => {
      if (c.section === 'head' && c.column.index > 0) c.cell.styles.halign = 'right'
    },
  })
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
  const totals: [string, string, boolean][] = [
    ['Subtotal', amt(inv.subtotal), false],
    ...(inv.discount && inv.discount.amount > 0 ? ([[plain(`Discount: ${inv.discount.label}`).slice(0, 42), `- ${amt(inv.discount.amount)}`, false]] as [string, string, boolean][]) : []),
    ...(inv.taxRate > 0 ? ([[`SST ${inv.taxRate}%`, amt(inv.tax), false]] as [string, string, boolean][]) : []),
    ['Total', amt(inv.total), true],
  ]
  totals.forEach(([k, v, bold], i) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(bold ? 11 : 9.5).setTextColor(...(bold ? ink : muted))
    doc.text(k, W - M - 50, y + i * 6.5, { align: 'right', maxWidth: 80 } as never)
    doc.setTextColor(...ink).text(v, W - M, y + i * 6.5, { align: 'right' })
  })
  y += totals.length * 6.5 + 8
  if (inv.status === 'paid') {
    doc.setDrawColor(21, 128, 61).setTextColor(21, 128, 61).setLineWidth(0.6).roundedRect(M, y - 5, 28, 9, 1.5, 1.5)
    doc.setFont('helvetica', 'bold').setFontSize(11).text('PAID', M + 14, y + 1.3, { align: 'center' })
    y += 12
  }
  if (inv.status === 'void') {
    doc.setTextColor(220, 38, 38).setFont('helvetica', 'bold').setFontSize(11).text(`VOID${inv.voidReason ? `: ${plain(inv.voidReason)}` : ''}`, M, y)
    y += 10
  }
  const block = (heading: string, text: string) => {
    if (!text) return
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...muted).text(heading, M, y)
    const lines = doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...ink).splitTextToSize(plain(text), W - 2 * M) as string[]
    doc.text(lines, M, y + 5)
    y += 8 + lines.length * 4.2
  }
  if (inv.status !== 'paid') block('HOW TO PAY', seller.paymentInfo)
  block('NOTE', inv.note ?? '')
  const H = doc.internal.pageSize.getHeight()
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...muted).text(plain(`${seller.companyName || 'Attend'} - ${inv.number}`), M, H - 10)
  doc.text('Computer-generated invoice. No signature required.', W - M, H - 10, { align: 'right' })
  doc.save(`${inv.number}.pdf`)
}
