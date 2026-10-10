import { type FormEvent, useEffect, useState } from 'react'
import { Button, inputClass } from '../components/ui'
import { type PlatformSettings, can, saveSettings } from '../data/platform'
import { Link } from 'react-router-dom'
import { t } from '../lib/i18n'
import { useOwner } from './context'
import { PaymentKeys } from './PaymentKeys'
import { PageHead, Section, useAction } from './ui'

/** The company that runs Attend, as it appears on invoices; and the price list for reference. */
export default function Settings() {
  const { settings, me } = useOwner()
  const { busy, run, messages } = useAction()
  const [s, setS] = useState<PlatformSettings>(settings)
  useEffect(() => setS(settings), [settings])
  const edit = can(me.role, 'settings')
  const field = (key: keyof PlatformSettings, label: string, props: Record<string, unknown> = {}) => (
    <label className="block text-xs font-medium text-muted">
      {label}
      <input value={String(s[key] ?? '')} onChange={(e) => setS({ ...s, [key]: props.type === 'number' ? Number(e.target.value) : e.target.value })} className={`${inputClass} mt-1`} {...props} />
    </label>
  )
  const submit = (e: FormEvent) => {
    e.preventDefault()
    run('save', () => saveSettings({ ...s, taxRate: Math.max(0, Math.min(100, Number(s.taxRate) || 0)), invoicePrefix: (s.invoicePrefix || 'INV').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'INV' }, me), t('Settings saved.'))
  }
  return (
    <>
      <PageHead title={t('Settings')} sub={edit ? t('Your company details on invoices, tax and numbering.') : t('Your role can see these settings but not change them.')} />
      {messages}
      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-2">
        <Section title={t('Company on invoices')}>
          <fieldset disabled={!edit} className="space-y-3">
            {field('companyName', t('Company name'), { required: true, maxLength: 100 })}
            {field('regNo', t('Registration no. (SSM)'), { maxLength: 40 })}
            <label className="block text-xs font-medium text-muted">{t('Address')}<textarea rows={3} value={s.address} onChange={(e) => setS({ ...s, address: e.target.value })} className={`${inputClass} mt-1`} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              {field('email', t('Billing email'), { type: 'email' })}
              {field('phone', t('Phone'))}
            </div>
          </fieldset>
        </Section>
        <Section title={t('Tax, numbering and payment')}>
          <fieldset disabled={!edit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {field('sstNo', t('SST registration no. (if registered)'), { maxLength: 40 })}
              {field('taxRate', t('SST rate % on new invoices'), { type: 'number', min: 0, max: 100, step: 0.5 })}
              {field('invoicePrefix', t('Invoice number prefix'), { maxLength: 8 })}
              <label className="block text-xs font-medium text-muted">{t('Default currency')}<select value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value as 'MYR' | 'USD' })} className={`${inputClass} mt-1`}><option value="MYR">RM</option><option value="USD">US$</option></select></label>
            </div>
            <p className="text-xs text-muted">{t('Invoices are numbered {prefix}-{year}-0001, 0002… in order, and never reused.', { prefix: s.invoicePrefix || 'INV', year: new Date().getFullYear() })}</p>
            <label className="block text-xs font-medium text-muted">{t('How to pay (printed on unpaid invoices)')}<textarea rows={4} value={s.paymentInfo} onChange={(e) => setS({ ...s, paymentInfo: e.target.value })} placeholder={t('e.g. Maybank 5123 4567 8901, Attend Sdn Bhd. DuitNow: 0123456789. Please use the invoice number as reference.')} className={`${inputClass} mt-1`} /></label>
          </fieldset>
        </Section>
        {edit && <div className="lg:col-span-2"><Button type="submit" busy={busy === 'save'}>{t('Save settings')}</Button></div>}
      </form>
      {me.role === 'owner' && <PaymentKeys />}
      <Section title={t('Prices and discounts')} sub={t('Plans, prices and discount codes are managed on their own page.')}>
        <Link to="/console/pricing" className="text-sm font-medium text-accent">{t('Open Pricing')} →</Link>
      </Section>
    </>
  )
}
