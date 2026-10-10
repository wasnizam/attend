import { type FormEvent, useEffect, useState } from 'react'
import { Button, inputClass } from '../components/ui'
import { type PaymentKeysStatus, paymentKeys } from '../data/billing'
import { formatDate, isoDate } from '../lib/format'
import { t } from '../lib/i18n'
import { Section, useAction } from './ui'

/**
 * The Stripe keys, for an owner of Attend. Keys go in here and are kept where no browser can read
 * them: this screen only ever shows which account they belong to and their last four characters.
 */
export function PaymentKeys() {
  const { busy, run, messages } = useAction()
  const [status, setStatus] = useState<PaymentKeysStatus | null>(null)
  const [failed, setFailed] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  useEffect(() => {
    paymentKeys('status').then(setStatus, (e: Error) => setFailed(e.message))
  }, [])

  const save = (e: FormEvent) => {
    e.preventDefault()
    run('keys', async () => {
      setStatus(await paymentKeys('save', { secretKey, webhookSecret }))
      setSecretKey('')
      setWebhookSecret('')
    }, t('Payment keys saved. They are in use within a minute.'))
  }
  const clear = () =>
    run('clear', async () => setStatus(await paymentKeys('clear')), t('Saved keys removed.'), t('Remove the keys saved here? Payments will then use the keys set in Vercel, or stop if there are none.'))

  const saved = status?.saved
  const pill = status?.mode === 'live' ? ['bg-good-soft text-good', t('Live')] : status?.mode === 'test' ? ['bg-[#fff4d6] text-[#8a5a00]', t('Test mode')] : ['bg-slate-100 text-slate-600', t('Not connected')]
  return (
    <Section
      title={t('Payments (Stripe)')}
      sub={t('The keys that connect Attend to your Stripe account. To move to another Stripe account, save its keys here.')}
      actions={status && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pill[0]}`}>{pill[1]}</span>}
      className="lg:col-span-2"
    >
      {messages}
      {failed && <p className="mt-3 rounded-lg bg-bad-soft px-4 py-2 text-sm text-bad">{failed}</p>}
      {status && (
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-muted">{t('Keys in use')}</dt><dd className="text-right font-medium">{status.keysFrom === 'console' ? t('Saved here') : status.keysFrom === 'vercel' ? t('Set in Vercel') : t('None')}</dd></div>
              {saved?.accountName && <div className="flex justify-between gap-4"><dt className="text-muted">{t('Stripe account')}</dt><dd className="text-right font-medium">{saved.accountName}</dd></div>}
              {saved?.keyEnd && <div className="flex justify-between gap-4"><dt className="text-muted">{t('Secret key')}</dt><dd className="tabular text-right font-medium">••••{saved.keyEnd}</dd></div>}
              <div className="flex justify-between gap-4"><dt className="text-muted">{t('Webhook secret')}</dt><dd className="tabular text-right font-medium">{saved?.webhookEnd ? `••••${saved.webhookEnd}` : status.webhookSecretSet ? t('Set') : t('Not set')}</dd></div>
              {saved?.updatedAt && <div className="flex justify-between gap-4"><dt className="text-muted">{t('Last changed')}</dt><dd className="text-right font-medium">{formatDate(isoDate(new Date(saved.updatedAt)))}{saved.updatedBy ? ` · ${saved.updatedBy}` : ''}</dd></div>}
            </dl>
            <form onSubmit={save} className="space-y-3" autoComplete="off">
              <label className="block text-xs font-medium text-muted">
                {t('Secret key (starts with sk_test_ or sk_live_)')}
                <input type="password" autoComplete="off" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder={saved?.keyEnd ? t('Leave empty to keep the current key') : ''} className={`${inputClass} mt-1`} />
              </label>
              <label className="block text-xs font-medium text-muted">
                {t('Webhook signing secret (starts with whsec_)')}
                <input type="password" autoComplete="off" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder={saved?.webhookEnd ? t('Leave empty to keep the current secret') : ''} className={`${inputClass} mt-1`} />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" busy={busy === 'keys'} disabled={!secretKey.trim() && !webhookSecret.trim()}>{t('Save keys')}</Button>
                {saved && <Button variant="secondary" busy={busy === 'clear'} onClick={clear}>{t('Remove saved keys')}</Button>}
              </div>
              <p className="text-xs text-muted">{t('Keys are checked with Stripe before they are saved, and can never be shown again: not here, and not to anyone on your team.')}</p>
            </form>
          </div>
          <div className="space-y-3 text-sm">
            <p className="font-medium">{t('In Stripe: Developers → Webhooks → Add endpoint')}</p>
            <label className="block text-xs font-medium text-muted">
              {t('Endpoint URL')}
              <input readOnly value={status.webhookUrl} onFocus={(e) => e.target.select()} className={`${inputClass} mt-1 font-mono !text-xs`} />
            </label>
            <div>
              <p className="text-xs font-medium text-muted">{t('Events to send')}</p>
              <ul className="mt-1 space-y-0.5 font-mono text-xs">{status.events.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
            <p className="text-xs text-muted">{t('Each Stripe account has its own keys and its own webhook secret: change both together. Customers already paying stay in the old Stripe account until their plan ends or you move them in Stripe.')}</p>
          </div>
        </div>
      )}
    </Section>
  )
}
