import { formatClock24 } from '../lib/format'
import { t } from '../lib/i18n'
import type { AttendanceRecord, AttendanceStatus } from '../lib/types'

interface Props {
  records: AttendanceRecord[]
  /** Newest first, with a brief highlight on arrival. Used on the live screen. */
  live?: boolean
  onRemove?: (record: AttendanceRecord) => void
  /** When given, the lecturer can correct a record: present, late, excused or MC. */
  onStatus?: (record: AttendanceRecord, status: AttendanceStatus) => void
  /** Record ID -> presence checks that student did not answer. */
  missed?: Map<string, number[]>
  /** Record ID -> a short warning for the lecturer, e.g. checked in from far away. */
  notes?: Map<string, string>
  /** Record ID -> extra lines under the name, such as MC remarks and evidence. */
  details?: Map<string, React.ReactNode>
}

export const STATUS_LABEL: Record<AttendanceStatus, string> = { present: 'Present', late: 'Late', excused: 'Excused', mc: 'MC' }
const STATUS_COLOR: Record<AttendanceStatus, string> = { present: 'text-good', late: 'text-[#b25e00]', excused: 'text-muted', mc: 'text-sky-700' }

export function AttendanceList({ records, live = false, onRemove, onStatus, missed, notes, details }: Props) {
  const rows = live ? [...records].reverse() : records
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <table className="w-full text-left text-sm">
        <thead className="bg-canvas text-xs font-medium text-muted">
          <tr>
            <th className="py-2.5 pr-2 pl-4 font-medium">{t('Student ID')}</th>
            <th className="px-2 py-2.5 font-medium">{t('Name')}</th>
            <th className="hidden px-2 py-2.5 font-medium sm:table-cell">{t('Time')}</th>
            <th className="px-2 py-2.5 font-medium">{t('Status')}</th>
            {onRemove && <th className="w-9" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const status = r.status ?? 'present'
            return (
              <tr key={r.id} className={live ? 'animate-rowin' : undefined}>
                <td className="tabular py-3 pr-2 pl-4 align-top font-medium whitespace-nowrap">{r.studentId}</td>
                <td className="px-2 py-3 align-top break-words">
                  {r.studentName}
                  <span className="tabular block text-xs text-muted sm:hidden">{formatClock24(r.timestamp)}</span>
                  {r.method === 'manual' && <span className="block text-xs text-muted">{t('Marked by lecturer')}</span>}
                  {details?.get(r.id)}
                  {notes?.get(r.id) && <span className="block text-xs font-medium text-[#b25e00]">{notes.get(r.id)}</span>}
                  {missed?.get(r.id) && (
                    <span className="block text-xs font-medium text-[#b25e00]">
                      {t('Did not confirm check {n}', { n: missed.get(r.id)!.join(', ') })}
                    </span>
                  )}
                </td>
                <td className="tabular hidden px-2 py-3 align-top text-muted sm:table-cell">{formatClock24(r.timestamp)}</td>
                <td className="px-2 py-2 align-top">
                  {onStatus ? (
                    <select
                      value={status}
                      aria-label={t('Status for {name}', { name: r.studentName })}
                      onChange={(e) => onStatus(r, e.target.value as AttendanceStatus)}
                      className={`h-8 rounded-md border border-line bg-white px-2 !text-sm font-medium ${STATUS_COLOR[status]}`}
                    >
                      {(Object.keys(STATUS_LABEL) as AttendanceStatus[]).map((s) => (
                        <option key={s} value={s}>{t(STATUS_LABEL[s])}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`inline-block py-1 font-medium ${STATUS_COLOR[status]}`}>{t(STATUS_LABEL[status])}</span>
                  )}
                </td>
                {onRemove && (
                  <td className="pr-1 text-right align-top">
                    <button
                      onClick={() => onRemove(r)}
                      aria-label={t('Remove {name}', { name: r.studentName })}
                      title={t('Remove this record')}
                      className="mt-1.5 size-8 rounded-md text-muted hover:bg-bad-soft hover:text-bad"
                    >
                      ×
                    </button>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
