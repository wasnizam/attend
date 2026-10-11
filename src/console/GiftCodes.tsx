import { type FormEvent, useEffect, useState } from 'react'
import { Button, Card, EmptyState, inputClass } from '../components/ui'
import { type GiftCodeRow, giftCodes } from '../data/billing'
import { can } from '../data/platform'
import { formatDate, isoDate } from '../lib/format'
import { t } from '../lib/i18n'
import { csvDownload, useOwner } from './context'
import { Section, td, th, useAction } from './ui'

const EDITION_LABEL = { any: 'Any edition', lecturers: 'Lecturers', trainers: 'Trainers', workplace: 'Workplace' } as const

/** Whether a code can still be used, and if not, why. */
function state(c: GiftCodeRow): [string, string] {
  if (c.disabled) return [t('Switched off'), 'bg-slate-100 text-slate-600']
  if (c.redeemBy && c.redeemBy < isoDate()) return [t('Expired'), 'bg-slate-100 text-slate-600']
  if (c.uses >= c.maxUses) return [t('Used'), 'bg-accent-soft text-accent']
  return [t('Ready'), 'bg-good-soft text-good']
}

/**
 * Free access codes: the team makes a code for a person or an organisation, who types it on their
 * Account page and gets Pro for the months it carries, with no payment.
 */
export function GiftCodes() {
  const { me, customers } = useOwner()
  const { busy, run, messages } = useAction()
  const [codes, setCodes] = useState<GiftCodeRow[] | null>(null)
  const [failed, setFailed] = useState('')
  const [fresh, setFresh] = useState<string[]>([])
  const edit = can(me.role, 'money')
  const [f, setF] = useState({ edition: 'any', months: 1, seats: 0, count: 1, maxUses: 1, redeemBy: '', note: '', code: '' })
  useEffect(() => {
    giftCodes('list').then((r) => setCodes(r.codes), (e: Error) => setFailed(e.message))
  }, [])
  const name = (orgId: string) => customers.find((c) => c.org.id === orgId)?.org.name ?? orgId

  const create = (e: FormEvent) => {
    e.preventDefault()
    run('create', async () => {
      const before = new Set((codes ?? []).map((c) => c.code))
      const r = await giftCodes('create', f)
      setCodes(r.codes)
      setFresh(r.codes.filter((c) => !before.has(c.code)).map((c) => c.code))
      setF({ ...f, code: '', note: '' })
    }, t('Codes made. Copy them from the list below.'))
  }
  const toggle = (c: GiftCodeRow) =>
    run(c.code, async () => setCodes((await giftCodes(c.disabled ? 'enable' : 'disable', { code: c.code })).codes), c.disabled ? t('Code switched on.') : t('Code switched off.'))
  const copy = (text: string) => navigator.clipboard?.writeText(text).catch(() => {})

  const num = (key: 'months' | 'seats' | 'count' | 'maxUses', label: string, min: number, max: number) => (
    <label className="block text-xs font-medium text-muted">
      {label}
      <input type="number" min={min} max={max} value={f[key]} onChange={(e) => setF({ ...f, [key]: Number(e.target.value) })} className={`${inputClass} mt-1`} />
    </label>
  )

  return (
    <div className="mt-5 space-y-4">
      {messages}
      {failed && <p className="rounded-lg bg-bad-soft px-4 py-2 text-sm text-bad">{failed}</p>}
      {edit && (
        <Section title={t('Make free access codes')} sub={t('Give a person or an organisation Pro for free, for as many months as you choose. They type the code on their Account page.')}>
          <form onSubmit={create} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-xs font-medium text-muted">
              {t('For')}
              <select value={f.edition} onChange={(e) => setF({ ...f, edition: e.target.value })} className={`${inputClass} mt-1`}>
                {Object.entries(EDITION_LABEL).map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}
              </select>
            </label>
            {num('months', t('Months free'), 1, 60)}
            {f.edition !== 'lecturers' && f.edition !== 'trainers' && num('seats', t('Staff covered, workplace (0 = no limit)'), 0, 100000)}
            {num('count', t('How many codes'), 1, 50)}
            {num('maxUses', t('Organisations per code'), 1, 10000)}
            <label className="block text-xs font-medium text-muted">
              {t('Must be used by (optional)')}
              <input type="date" min={isoDate()} value={f.redeemBy} onChange={(e) => setF({ ...f, redeemBy: e.target.value })} className={`${inputClass} mt-1`} />
            </label>
            <label className="block text-xs font-medium text-muted sm:col-span-2">
              {t('Who it is for (a note for your team)')}
              <input value={f.note} maxLength={120} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder={t('e.g. Sunrise Café, 3 months for the pilot')} className={`${inputClass} mt-1`} />
            </label>
            {f.count === 1 && (
              <label className="block text-xs font-medium text-muted sm:col-span-2">
                {t('Your own code (optional; leave empty for a random one)')}
                <input value={f.code} maxLength={40} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="PARTNER2026" className={`${inputClass} mt-1 font-mono`} />
              </label>
            )}
            <div className="flex items-end sm:col-span-2 lg:col-span-4">
              <Button type="submit" busy={busy === 'create'}>{t(f.count === 1 ? 'Make code' : 'Make {n} codes', { n: f.count })}</Button>
            </div>
          </form>
        </Section>
      )}

      {codes === null ? null : codes.length === 0 ? (
        <EmptyState title={t('No free access codes yet')} text={t('Make one above and send it to the person it is for.')} />
      ) : (
        <Card className="overflow-x-auto">
          <div className="flex items-center justify-between gap-3 px-5 py-3">
            <h2 className="font-semibold">{t('Codes')}</h2>
            <button
              type="button"
              className="text-sm font-medium text-accent"
              onClick={() => csvDownload('free-access-codes', [['Code', 'For', 'Months', 'Staff', 'Used', 'Of', 'Use by', 'Note', 'State', 'Used by'], ...codes.map((c) => [c.code, EDITION_LABEL[c.edition], c.months, c.seats || '', c.uses, c.maxUses, c.redeemBy ?? '', c.note, state(c)[0], c.redeemedBy.map(name).join('; ')])])}
            >
              {t('Export for Excel')}
            </button>
          </div>
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>{t('Code')}</th>
                <th className={th}>{t('Gives')}</th>
                <th className={th}>{t('Who it is for')}</th>
                <th className={th}>{t('Used')}</th>
                <th className={th}>{t('State')}</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {codes.map((c) => {
                const [label, tone] = state(c)
                return (
                  <tr key={c.code} className={fresh.includes(c.code) ? 'bg-good-soft/40' : ''}>
                    <td className={td}>
                      <button type="button" title={t('Copy')} onClick={() => copy(c.code)} className="font-mono font-semibold hover:text-accent">{c.code}</button>
                    </td>
                    <td className={td}>
                      {t(c.months === 1 ? '1 month free' : '{n} months free', { n: c.months })}
                      <span className="block text-xs text-muted">{t(EDITION_LABEL[c.edition])}{c.seats ? ` · ${t('{n} staff', { n: c.seats })}` : ''}</span>
                    </td>
                    <td className={td}>
                      {c.note || '—'}
                      {c.redeemBy && <span className="block text-xs text-muted">{t('Use by {date}', { date: formatDate(c.redeemBy) })}</span>}
                    </td>
                    <td className={td}>
                      <span className="tabular">{c.uses} / {c.maxUses}</span>
                      {c.redeemedBy.length > 0 && <span className="block text-xs text-muted">{c.redeemedBy.map(name).join(', ')}</span>}
                    </td>
                    <td className={td}><span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${tone}`}>{label}</span></td>
                    <td className={`${td} text-right`}>
                      {edit && <button type="button" disabled={busy === c.code} onClick={() => toggle(c)} className="text-sm font-medium text-accent disabled:opacity-50">{c.disabled ? t('Switch on') : t('Switch off')}</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
