import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, EmptyState, inputClass } from '../components/ui'
import { can, voidInvoice } from '../data/platform'
import { formatDate, isoDate } from '../lib/format'
import { t } from '../lib/i18n'
import { downloadInvoicePdf } from '../lib/invoicePdf'
import { InvoiceStatus } from './CustomerDetail'
import { csvDownload, dateOf, lastMonths, money, moneyMix, monthName, revenueByMonth, useOwner } from './context'
import { InvoiceForm, PaymentForm } from './forms'
import { Kpi, PageHead, Section, Tabs, td, th, useAction } from './ui'

type View = 'invoices' | 'payments'

/** Invoices, payments and refunds across all customers. */
export default function Billing() {
  const { invoices, billing, customers, settings, me } = useOwner()
  const { busy, run, messages } = useAction()
  const [view, setView] = useState<View>('invoices')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [newFor, setNewFor] = useState('')
  const [form, setForm] = useState<'' | 'invoice' | 'payment'>('')
  const [notice, setNotice] = useState('')
  const close = (message?: string) => {
    setForm('')
    if (message) setNotice(message)
  }
  const today = isoDate()
  const moneyOk = can(me.role, 'money')
  const term = q.trim().toLowerCase()
  const shownInvoices = invoices.filter((i) => (!status || (status === 'overdue' ? i.status === 'unpaid' && i.dueDate < today : i.status === status)) && (!term || `${i.number} ${i.organisationName} ${i.billTo.email}`.toLowerCase().includes(term)))
  const money_ = billing.filter((b) => b.kind !== 'change' && (!term || `${b.organisationName} ${b.note} ${b.method}`.toLowerCase().includes(term)))
  const sum = (rows: { currency?: string; total?: number; amount?: number; kind?: string }[], field: 'total' | 'amount') =>
    rows.reduce<Record<string, number>>((a, r) => ({ ...a, [r.currency ?? 'MYR']: (a[r.currency ?? 'MYR'] ?? 0) + (r.kind === 'refund' ? -1 : 1) * (r[field] ?? 0) }), {})
  const unpaid = invoices.filter((i) => i.status === 'unpaid')
  const months = lastMonths(12)
  const revenue = revenueByMonth(billing, months)
  const customer = customers.find((c) => c.org.id === newFor)
  const exportInvoices = () =>
    csvDownload(`attend-invoices-${today}.csv`, [
      ['Number', 'Customer', 'Email', 'Issued', 'Due', 'Currency', 'Subtotal', 'SST', 'Total', 'Status'],
      ...shownInvoices.map((i) => [i.number, i.organisationName, i.billTo.email, i.issueDate, i.dueDate, i.currency, i.subtotal, i.tax, i.total, i.status]),
    ])
  const exportPayments = () =>
    csvDownload(`attend-payments-${today}.csv`, [
      ['Date', 'Customer', 'Type', 'Amount', 'Currency', 'Method', 'Reference'],
      ...money_.map((b) => [b.at ? isoDate(b.at.toDate()) : '', b.organisationName ?? b.organisationId, b.kind, (b.kind === 'refund' ? -1 : 1) * (b.amount ?? 0), b.currency ?? 'MYR', b.method ?? '', b.note ?? '']),
    ])
  return (
    <>
      <PageHead
        title={t('Billing')}
        sub={t('Invoices, payments and refunds. Nothing here can be deleted: invoices are voided, refunds are recorded.')}
        actions={
          moneyOk && (
            <div className="flex flex-wrap items-center gap-2">
              <select value={newFor} onChange={(e) => setNewFor(e.target.value)} className={`${inputClass} w-56`} aria-label={t('Customer')}>
                <option value="">{t('Choose a customer…')}</option>
                {[...customers].sort((a, b) => a.org.name.localeCompare(b.org.name)).map((c) => <option key={c.org.id} value={c.org.id}>{c.org.name}</option>)}
              </select>
              <Button variant="secondary" disabled={!customer} onClick={() => setForm('invoice')}>{t('New invoice')}</Button>
              <Button variant="secondary" disabled={!customer} onClick={() => setForm('payment')}>{t('Record payment')}</Button>
            </div>
          )
        }
      />
      {messages}
      {notice && <p className="rounded-lg bg-good-soft px-4 py-2 text-sm text-good">{notice}</p>}
      {form && customer && (
        <Section title={`${form === 'invoice' ? t('New invoice') : t('Record a payment')} · ${customer.org.name}`}>
          {form === 'invoice' ? <InvoiceForm c={customer} onDone={close} /> : <PaymentForm c={customer} onDone={close} />}
        </Section>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t('Received this month')} value={moneyMix(revenue[11].sums)} />
        <Kpi label={t('Received in 12 months')} value={moneyMix(revenue.reduce<Record<string, number>>((a, r) => { for (const [k, v] of Object.entries(r.sums)) a[k] = (a[k] ?? 0) + v; return a }, {}))} />
        <Kpi label={t('Unpaid invoices')} value={unpaid.length} note={moneyMix(sum(unpaid, 'total'))} />
        <Kpi label={t('Overdue')} value={unpaid.filter((i) => i.dueDate < today).length} tone={unpaid.some((i) => i.dueDate < today) ? 'warn' : undefined} />
      </div>
      <Tabs value={view} onChange={setView} items={[['invoices', t('Invoices'), invoices.length], ['payments', t('Payments and refunds'), money_.length]]} />
      <div className="flex flex-wrap gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={view === 'invoices' ? t('Search number, customer or email') : t('Search customer, method or reference')} className={`${inputClass} max-w-xs`} />
        {view === 'invoices' && (
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} w-auto`}>
            <option value="">{t('Any status')}</option>
            <option value="unpaid">{t('Unpaid')}</option>
            <option value="overdue">{t('Overdue')}</option>
            <option value="paid">{t('Paid')}</option>
            <option value="void">{t('Void')}</option>
          </select>
        )}
        <Button variant="secondary" onClick={view === 'invoices' ? exportInvoices : exportPayments}>{t('Export for Excel')}</Button>
      </div>
      {view === 'invoices' ? (
        shownInvoices.length === 0 ? (
          <EmptyState title={t('No invoices')} text={t('Choose a customer above and issue one.')} />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="bg-slate-50"><tr>{['Number', 'Customer', 'Issued', 'Due', 'Total', 'Status', ''].map((h) => <th key={h} className={th}>{h && t(h)}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {shownInvoices.map((i) => (
                  <tr key={i.id}>
                    <td className={`${td} font-medium`}>{i.number}</td>
                    <td className={td}><Link to={`/console/customers/${i.organisationId}`} className="text-accent hover:underline">{i.organisationName}</Link><span className="block text-xs text-muted">{i.billTo.email}</span></td>
                    <td className={`${td} whitespace-nowrap`}>{formatDate(i.issueDate)}</td>
                    <td className={`${td} whitespace-nowrap`}>{formatDate(i.dueDate)}</td>
                    <td className={`${td} tabular`}>{money(i.total, i.currency)}</td>
                    <td className={td}><InvoiceStatus status={i.status} overdue={i.status === 'unpaid' && i.dueDate < today} /></td>
                    <td className={`${td} text-right whitespace-nowrap`}>
                      <button type="button" className="text-xs font-medium text-accent" onClick={() => downloadInvoicePdf(i, settings)}>PDF</button>
                      {moneyOk && i.status === 'unpaid' && (
                        <>
                          <button type="button" className="ml-3 text-xs font-medium text-accent" onClick={() => { setNewFor(i.organisationId); setForm('payment'); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>{t('Mark paid')}</button>
                          <button type="button" className="ml-3 text-xs font-medium text-bad" disabled={busy === i.id} onClick={() => { const why = window.prompt(t('Why is {n} being voided?', { n: i.number })); if (why) run(i.id, () => voidInvoice(i, why, me), t('Invoice voided.')) }}>{t('Void')}</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      ) : money_.length === 0 ? (
        <EmptyState title={t('No payments recorded yet')} text={t('Choose a customer above and record a payment when money comes in.')} />
      ) : (
        <div className="space-y-4">
          {[...new Set(money_.map((b) => (b.at ? isoDate(b.at.toDate()).slice(0, 7) : today.slice(0, 7))))].sort().reverse().map((m) => {
            const list = money_.filter((b) => (b.at ? isoDate(b.at.toDate()).slice(0, 7) : today.slice(0, 7)) === m)
            return (
              <Card key={m} className="overflow-hidden">
                <div className="flex justify-between bg-slate-50 px-5 py-2.5 text-sm font-semibold"><span>{monthName(m, true)}</span><span className="tabular">{moneyMix(sum(list, 'amount'))}</span></div>
                <ul className="divide-y divide-line text-sm">
                  {list.map((b) => (
                    <li key={b.id} className="flex flex-wrap justify-between gap-x-3 px-5 py-2.5">
                      <span><Link to={`/console/customers/${b.organisationId}`} className="font-medium text-accent hover:underline">{b.organisationName ?? b.organisationId}</Link><span className="text-muted"> · {b.kind === 'refund' ? t('Refund') : t('Payment')} · {t(b.method ?? '')}{b.note ? ` · ${b.note}` : ''}</span></span>
                      <span className={`tabular ${b.kind === 'refund' ? 'text-bad' : ''}`}>{b.kind === 'refund' ? '−' : ''}{money(b.amount ?? 0, b.currency)} <span className="text-xs text-muted">· {b.at ? dateOf(b.at.toMillis()) : '…'}</span></span>
                    </li>
                  ))}
                </ul>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
