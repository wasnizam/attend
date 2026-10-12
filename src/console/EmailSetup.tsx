import { type FormEvent, useEffect, useState } from 'react'
import { Button, inputClass } from '../components/ui'
import { type EmailStatus, emailSetup } from '../data/billing'
import { formatDate, isoDate } from '../lib/format'
import { t } from '../lib/i18n'
import { Section, useAction } from './ui'

const SENDS: [string, string][] = [
  ['Welcome', 'When someone makes an account.'],
  ['Trial ending', 'Three days before a Pro trial ends, and once when it has ended.'],
  ['Payment received', 'A receipt for each payment, with a link to the invoice.'],
  ['Payment failed', 'The first time a card is refused, with the way to change it.'],
  ['Plan cancelled', 'When a customer cancels, saying until when it stays on; and once when it has ended.'],
]

/**
 * Emails to customers, for an owner of Dobry: the email service's key and the address they come
 * from. The key is kept where no browser can read it; this screen only shows its last four characters.
 */
export function EmailSetup() {
  const { busy, run, messages } = useAction()
  const [status, setStatus] = useState<EmailStatus | null>(null)
  const [failed, setFailed] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [from, setFrom] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [test, setTest] = useState<EmailStatus['tested']>()
  useEffect(() => {
    emailSetup('status').then((s) => {
      setStatus(s)
      setFrom(s.from)
      setReplyTo(s.replyTo)
    }, (e: Error) => setFailed(e.message))
  }, [])

  const save = (e: FormEvent) => {
    e.preventDefault()
    run('email', async () => {
      setStatus(await emailSetup('save', { apiKey, from, replyTo }))
      setApiKey('')
    }, t('Email set-up saved.'))
  }
  const sendTest = () =>
    run('test', async () => {
      const s = await emailSetup('test')
      setStatus(s)
      setTest(s.tested)
    }, '')
  const clear = () => run('clear', async () => setStatus(await emailSetup('clear')), t('Email set-up removed.'), t('Remove the email set-up? Dobry will stop sending emails to customers.'))

  const pill = status?.ready ? ['bg-good-soft text-good', t('Sending')] : ['bg-slate-100 text-slate-600', t('Not set up')]
  return (
    <Section
      title={t('Emails to customers')}
      sub={t('Dobry sends a few emails about a customer’s own account. They go out through Resend, an email service: make an account there, confirm your domain, and paste its key here.')}
      actions={status && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pill[0]}`}>{pill[1]}</span>}
      className="lg:col-span-2"
    >
      {messages}
      {failed && <p className="mt-3 rounded-lg bg-bad-soft px-4 py-2 text-sm text-bad">{failed}</p>}
      {status && (
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <form onSubmit={save} className="space-y-3" autoComplete="off">
            <label className="block text-xs font-medium text-muted">
              {t('Resend API key (starts with re_)')}
              <input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={status.keyEnd ? `••••${status.keyEnd} · ${t('Leave empty to keep the current key')}` : status.keyFromVercel ? t('Set in Vercel') : ''} className={`${inputClass} mt-1`} />
            </label>
            <label className="block text-xs font-medium text-muted">
              {t('Emails come from')}
              <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Dobry <hello@dobry.app>" maxLength={120} className={`${inputClass} mt-1`} />
            </label>
            <label className="block text-xs font-medium text-muted">
              {t('Replies go to (optional)')}
              <input type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="you@example.com" maxLength={120} className={`${inputClass} mt-1`} />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" busy={busy === 'email'} disabled={!apiKey.trim() && from.trim() === status.from && replyTo.trim() === status.replyTo}>{t('Save')}</Button>
              <Button variant="secondary" busy={busy === 'test'} disabled={!status.ready} onClick={sendTest}>{t('Send me a test')}</Button>
              {(status.keyEnd || status.from) && <Button variant="secondary" busy={busy === 'clear'} onClick={clear}>{t('Remove')}</Button>}
            </div>
            {test && (
              <p className={`rounded-lg px-4 py-2.5 text-sm ${test.ok ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad'}`}>
                {test.ok ? t('Test sent to {email}. Check your inbox, and the spam folder.', { email: test.to ?? '' }) : `${t('The test could not be sent.')} ${test.error ?? ''}`}
              </p>
            )}
            {status.updatedAt && <p className="text-xs text-muted">{t('Last changed')}: {formatDate(isoDate(new Date(status.updatedAt)))}{status.updatedBy ? ` · ${status.updatedBy}` : ''}</p>}
            <p className="text-xs text-muted">{t('The sender must be an address on a domain you have confirmed in Resend, or the emails will be refused.')}</p>
          </form>
          <div className="text-sm">
            <p className="font-medium">{t('What Dobry sends')}</p>
            <ul className="mt-2 space-y-2">
              {SENDS.map(([name, when]) => (
                <li key={name}>
                  <span className="font-medium">{t(name)}</span>
                  <span className="block text-xs text-muted">{t(when)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">{t('Each goes to the account’s owner, once, and is noted in the audit log.')}</p>
          </div>
        </div>
      )}
    </Section>
  )
}
