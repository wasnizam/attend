import { type FormEvent, useEffect, useState } from 'react'
import { Button, inputClass } from '../components/ui'
import { type InvoiceItem, Timestamp, createInvoice, invoiceTotals, recordPayment, recordRefund } from '../data/platform'
import { addDays, formatDate, isoDate } from '../lib/format'
import { t } from '../lib/i18n'
import type { Organisation } from '../lib/types'
import { type Customer, dateOf, editionName, money, useOwner } from './context'
import { useAction } from './ui'

const CYCLE: Record<string, string> = { month: 'monthly', semester: 'per semester', year: 'yearly' }
const label = 'block text-xs font-medium text-muted'

/** A new numbered invoice for one customer, filled in from what they pay. */
export function InvoiceForm({ c, onDone }: { c: Customer; onDone: (message?: string) => void }) {
  const { settings, me } = useOwner()
  const { busy, run, messages, setError } = useAction()
  const price = c.org.price
  const [billName, setBillName] = useState(c.org.name)
  const [billEmail, setBillEmail] = useState(c.owner?.email ?? '')
  const [billAddress, setBillAddress] = useState('')
  const [currency, setCurrency] = useState<'MYR' | 'USD'>(price?.currency ?? settings.currency)
  const [taxRate, setTaxRate] = useState(String(settings.taxRate ?? 0))
  const [issueDate, setIssueDate] = useState(isoDate())
  const [dueDate, setDueDate] = useState(addDays(isoDate(), 14))
  const [note, setNote] = useState('')
  const [items, setItems] = useState<{ description: string; qty: string; unitPrice: string }[]>([
    { description: `Attend ${editionName(c.org)} Pro${price ? ` (${CYCLE[price.cycle]})` : ''}${c.org.purpose === 'workplace' && c.org.seats ? `, up to ${c.org.seats} staff` : ''}`, qty: '1', unitPrice: price ? String(price.amount) : '' },
  ])
  const parsed: InvoiceItem[] = items.filter((i) => i.description.trim()).map((i) => ({ description: i.description.trim(), qty: Math.max(0, Number(i.qty) || 0), unitPrice: Math.max(0, Number(i.unitPrice) || 0) }))
  const totals = invoiceTotals(parsed, Number(taxRate) || 0)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!parsed.length || totals.total <= 0) return setError(t('Add at least one line with an amount.'))
    if (!billEmail.trim()) return setError(t('Add the email the invoice goes to.'))
    run(
      'save',
      async () => {
        const number = await createInvoice(c.org, { billTo: { name: billName.trim(), email: billEmail.trim(), address: billAddress.trim() }, items: parsed, currency, taxRate: Number(taxRate) || 0, issueDate, dueDate, note: note.trim() }, settings.invoicePrefix, me)
        onDone(t('Invoice {n} issued.', { n: number }))
      },
      t('Invoice issued.'),
    )
  }
  const setItem = (i: number, patch: Partial<(typeof items)[number]>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>{t('Bill to')}<input required value={billName} onChange={(e) => setBillName(e.target.value)} className={`${inputClass} mt-1`} /></label>
        <label className={label}>{t('Email')}<input type="email" required value={billEmail} onChange={(e) => setBillEmail(e.target.value)} className={`${inputClass} mt-1`} /></label>
        <label className={`${label} sm:col-span-2`}>{t('Address (optional)')}<textarea rows={2} value={billAddress} onChange={(e) => setBillAddress(e.target.value)} className={`${inputClass} mt-1`} /></label>
      </div>
      <div className="space-y-2">
        <p className={label}>{t('Lines')}</p>
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-[1fr_4.5rem_7rem_auto] gap-2">
            <input value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder={t('Description')} className={inputClass} />
            <input type="number" min="0" step="1" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} aria-label={t('Quantity')} className={inputClass} />
            <input type="number" min="0" step="0.01" value={it.unitPrice} onChange={(e) => setItem(i, { unitPrice: e.target.value })} placeholder={t('Unit price')} className={inputClass} />
            <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} disabled={items.length === 1} className="px-2 text-muted hover:text-bad disabled:opacity-30" aria-label={t('Remove line')}>×</button>
          </div>
        ))}
        <button type="button" onClick={() => setItems([...items, { description: '', qty: '1', unitPrice: '' }])} className="text-sm font-medium text-accent">+ {t('Add a line')}</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className={label}>{t('Currency')}<select value={currency} onChange={(e) => setCurrency(e.target.value as 'MYR' | 'USD')} className={`${inputClass} mt-1`}><option value="MYR">RM</option><option value="USD">US$</option></select></label>
        <label className={label}>{t('SST %')}<input type="number" min="0" max="100" step="0.5" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className={`${inputClass} mt-1`} /></label>
        <label className={label}>{t('Issue date')}<input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={`${inputClass} mt-1`} /></label>
        <label className={label}>{t('Due date')}<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${inputClass} mt-1`} /></label>
      </div>
      <label className={label}>{t('Note on the invoice (optional)')}<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className={`${inputClass} mt-1`} /></label>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-canvas px-4 py-3 text-sm">
        <span className="text-muted">{t('Subtotal')} {money(totals.subtotal, currency)}{Number(taxRate) > 0 ? ` · SST ${money(totals.tax, currency)}` : ''}</span>
        <span className="text-base font-semibold">{t('Total')} {money(totals.total, currency)}</span>
      </div>
      {messages}
      <div className="flex gap-2">
        <Button type="submit" busy={busy === 'save'}>{t('Issue invoice')}</Button>
        <Button type="button" variant="secondary" onClick={() => onDone()}>{t('Cancel')}</Button>
      </div>
    </form>
  )
}

/** Money in (or back out) for one customer; a payment can settle an invoice and extend Pro. */
export function PaymentForm({ c, refund = false, onDone }: { c: Customer; refund?: boolean; onDone: (message?: string) => void }) {
  const { invoices, me } = useOwner()
  const { busy, run, messages, setError } = useAction()
  const org: Organisation = c.org
  const workplace = org.purpose === 'workplace'
  const paidMs = org.paidUntil?.toMillis() ?? 0
  const renewFrom = paidMs > Date.now() ? isoDate(new Date(paidMs)) : isoDate()
  const months = org.price?.cycle === 'year' ? 12 : org.price?.cycle === 'semester' ? 6 : 1
  const unpaid = invoices.filter((i) => i.organisationId === org.id && i.status === 'unpaid')
  const [invoiceId, setInvoiceId] = useState(unpaid[0]?.id ?? '')
  const inv = unpaid.find((i) => i.id === invoiceId)
  const [amount, setAmount] = useState(inv ? String(inv.total) : org.price ? String(org.price.amount) : '')
  const [currency, setCurrency] = useState<'MYR' | 'USD'>(inv?.currency ?? org.price?.currency ?? 'MYR')
  const [method, setMethod] = useState('Bank transfer')
  const [reference, setReference] = useState('')
  const [extend, setExtend] = useState(!refund)
  const [extendTo, setExtendTo] = useState(() => {
    const d = new Date(`${renewFrom}T00:00:00`)
    d.setMonth(d.getMonth() + months)
    return isoDate(d)
  })
  useEffect(() => {
    if (inv) {
      setAmount(String(inv.total))
      setCurrency(inv.currency)
    }
  }, [inv])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const n = Number(amount)
    if (!(n > 0)) return setError(t('Enter the amount.'))
    if (refund) return run('save', async () => { await recordRefund(org, { amount: n, currency, method, note: reference.trim() }, me); onDone(t('Refund of {amount} recorded.', { amount: money(n, currency) })) }, t('Refund recorded.'))
    if (extend && paidMs > Date.now() && new Date(`${extendTo}T23:59:59`).getTime() < paidMs && !window.confirm(t('This ends their paid period earlier, on {date} instead of {old}. Continue?', { date: formatDate(extendTo), old: dateOf(paidMs) }))) return
    run(
      'save',
      async () => {
        await recordPayment(org, { amount: n, currency, method, note: reference.trim(), invoiceId: invoiceId || undefined }, me, extend ? { paidUntil: Timestamp.fromDate(new Date(`${extendTo}T23:59:59`)), ...(workplace && org.seats ? { seats: org.seats } : {}) } : undefined)
        onDone(extend ? t('Payment of {amount} recorded. Pro until {date}.', { amount: money(n, currency), date: formatDate(extendTo) }) : t('Payment of {amount} recorded.', { amount: money(n, currency) }))
      },
      t('Payment recorded.'),
    )
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      {!refund && unpaid.length > 0 && (
        <label className={label}>
          {t('For invoice')}
          <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} className={`${inputClass} mt-1`}>
            <option value="">{t('No invoice')}</option>
            {unpaid.map((i) => <option key={i.id} value={i.id}>{i.number} · {money(i.total, i.currency)}</option>)}
          </select>
        </label>
      )}
      <div className="flex gap-2">
        <select value={currency} onChange={(e) => setCurrency(e.target.value as 'MYR' | 'USD')} className={`${inputClass} w-24`} aria-label={t('Currency')}>
          <option value="MYR">RM</option>
          <option value="USD">US$</option>
        </select>
        <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t('Amount')} className={inputClass} />
      </div>
      <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputClass} aria-label={t('Method')}>
        {['Bank transfer', 'DuitNow', 'Card', 'Cash', 'Other'].map((m) => <option key={m} value={m}>{t(m)}</option>)}
      </select>
      <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} placeholder={refund ? t('Reason') : t('Reference (optional)')} className={inputClass} required={refund} />
      {!refund && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={extend} onChange={(e) => setExtend(e.target.checked)} className="size-4 accent-accent" />
            {t('And make them Pro until')}
          </label>
          {extend && <input type="date" value={extendTo} onChange={(e) => setExtendTo(e.target.value)} className={inputClass} aria-label={t('And make them Pro until')} />}
          {extend && paidMs > Date.now() && <p className="text-xs text-muted">{t('Now paid until {date}.', { date: dateOf(paidMs) })}</p>}
        </>
      )}
      {messages}
      <div className="flex gap-2">
        <Button type="submit" variant={refund ? 'danger' : 'primary'} busy={busy === 'save'}>{refund ? t('Record refund') : t('Record payment')}</Button>
        <Button type="button" variant="secondary" onClick={() => onDone()}>{t('Cancel')}</Button>
      </div>
    </form>
  )
}
