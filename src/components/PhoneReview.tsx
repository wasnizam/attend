import { useState } from 'react'
import { markPhoneChecked } from '../data/attendance'
import { type Phones, approvePhone, phoneFlags, resetPhone, subscribePhones } from '../data/phones'
import { useProfile } from '../hooks/useAuth'
import { useLive } from '../hooks/useLive'
import { formatClock24, formatDate } from '../lib/format'
import { t } from '../lib/i18n'
import type { AttendanceRecord } from '../lib/types'
import { Card, EmptyState, ErrorNote, PageLoader, friendlyError } from './ui'

/**
 * For an admin, the whole company's phone flags in one place: every clock-in from a phone
 * that is not the person's own, with the same buttons as on the day's list, and each person's
 * registered phone with a way to forget it.
 */
export function PhoneReview({ records, rangeLabel, listOf }: { records: AttendanceRecord[]; rangeLabel: string; /** Session ID -> its staff list. */ listOf: Map<string, string> }) {
  const profile = useProfile()
  const org = profile.organisationId
  const phones = useLive<Phones>((onData, onError) => subscribePhones(org, onData, onError), [org])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (phones.loading) return <PageLoader />
  if (!phones.data) return <ErrorNote>{t('We could not load this data. Check your connection and reload.')}</ErrorNote>
  const data = phones.data

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }
  const flags = phoneFlags(records, data)
  const flagged = records.filter((r) => flags.has(r.id))
  // Names for the registered phones, from the check-ins on screen.
  const nameOf = new Map(records.map((r) => [r.studentKey, `${r.studentName} · ${r.studentId}`]))
  const owner = (key: string) => records.find((r) => r.studentKey === key)?.studentName ?? key
  const button = 'text-xs font-semibold text-accent hover:underline disabled:opacity-50'

  return (
    <div className="space-y-5">
      <ErrorNote>{error}</ErrorNote>
      <section>
        <h2 className="mb-2 font-semibold">
          {t('To check')} <span className="font-normal text-muted">· {flagged.length} · {rangeLabel}</span>
        </h2>
        {flagged.length === 0 ? (
          <EmptyState title={t('Nothing to check')} text={t('Every clock-in in these dates came from the person’s own phone.')} />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-muted">
                <tr>
                  <th className="py-2.5 pr-2 pl-5 font-medium">{t('When')}</th>
                  <th className="px-2 py-2.5 font-medium">{t('Name')}</th>
                  <th className="px-2 py-2.5 font-medium">{t('Why')}</th>
                  <th className="py-2.5 pr-5 pl-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {flagged.map((r) => {
                  const f = flags.get(r.id)!
                  const why =
                    f.kind === 'other' ? t('Phone belongs to {name}', { name: owner(f.owner) })
                      : f.kind === 'unknown' ? t('Not their usual phone')
                        : f.kind === 'shared' ? t('Same phone as {name}', { name: f.with.join(', ') })
                          : t('Phone not recognised')
                  return (
                    <tr key={r.id}>
                      <td className="tabular py-2.5 pr-2 pl-5 whitespace-nowrap text-muted">
                        {formatDate(r.date)} · {formatClock24(r.timestamp)}
                        <span className="block text-xs">{r.sessionName}</span>
                      </td>
                      <td className="px-2 py-2.5 font-medium">{r.studentName}<span className="block text-xs font-normal text-muted">{r.studentId}</span></td>
                      <td className="px-2 py-2.5 text-[#8a5a00]">{why}</td>
                      <td className="py-2.5 pr-5 pl-2">
                        <div className="flex flex-col items-start gap-1">
                          {f.kind === 'unknown' && (
                            <button disabled={busy} className={button} onClick={() => run(() => approvePhone(org, r.studentKey, r.device!, profile, data.byDevice.get(f.registered) === r.studentKey ? f.registered : undefined, listOf.get(r.sessionId) ?? ''))}>
                              {t('This is their new phone')}
                            </button>
                          )}
                          {f.kind === 'other' && (
                            <button disabled={busy} className={button} onClick={() => run(() => approvePhone(org, r.studentKey, r.device!, profile, data.byStaff.get(r.studentKey), listOf.get(r.sessionId) ?? ''))}>
                              {t('It is {name}’s phone now', { name: r.studentName })}
                            </button>
                          )}
                          <button disabled={busy} className={button} onClick={() => run(() => markPhoneChecked(r.id))}>
                            {t('Checked, it is fine')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">
          {t('Registered phones')} <span className="font-normal text-muted">· {data.byStaff.size}</span>
        </h2>
        {data.byStaff.size === 0 ? (
          <p className="rounded-lg bg-canvas px-4 py-5 text-center text-sm text-muted">{t('Phones are registered by each person’s first clock-in.')}</p>
        ) : (
          <Card>
            <ul className="divide-y divide-line text-sm">
              {[...data.byStaff.keys()].sort().map((key) => (
                <li key={key} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <span className="min-w-0 truncate">{nameOf.get(key) ?? key}</span>
                  <button
                    disabled={busy}
                    className="shrink-0 text-xs font-medium text-muted hover:text-ink"
                    onClick={() => {
                      if (window.confirm(t('Forget {name}’s phone? Their next clock-in registers the phone they use then.', { name: nameOf.get(key) ?? key }))) run(() => resetPhone(org, key, data))
                    }}
                  >
                    {t('Reset phone')}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  )
}
