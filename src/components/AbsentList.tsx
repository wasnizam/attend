import type { Absentee } from '../lib/csv'
import { t } from '../lib/i18n'
import { has } from '../lib/purpose'
import type { AttendanceStatus } from '../lib/types'

interface Props {
  absent: Absentee[]
  open?: boolean
  /** When given, each student gets buttons to record them by hand. */
  onMark?: (student: Absentee, status: AttendanceStatus) => void
  busy?: boolean
}

/** Named absentees. Only shown for sessions that use a class list. */
export function AbsentList({ absent, open = false, onMark, busy }: Props) {
  if (absent.length === 0) return null
  const pill = 'h-8 rounded-md border border-line bg-white px-3 text-xs font-semibold hover:bg-canvas disabled:opacity-50'
  return (
    <details open={open} className="rounded-lg border border-line">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold select-none">
        {t('Not checked in')} <span className="tabular font-normal text-muted">· {absent.length}</span>
      </summary>
      <ul className="divide-y divide-line border-t border-line text-sm">
        {absent.map((a) => (
          <li key={a.studentId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
            <span className="tabular shrink-0 font-medium whitespace-nowrap">{a.studentId}</span>
            <span className="min-w-0 flex-1 break-words text-muted">{a.studentName}</span>
            {onMark && (
              <span className="flex shrink-0 gap-1.5">
                <button disabled={busy} className={`${pill} text-good`} onClick={() => onMark(a, 'present')}>
                  {t('Present')}
                </button>
                <button disabled={busy} className={`${pill} text-muted`} onClick={() => onMark(a, 'excused')}>
                  {t('Excused')}
                </button>
                {has('mc') && (
                  <button disabled={busy} className={`${pill} text-sky-700`} title={t('Medical certificate')} onClick={() => onMark(a, 'mc')}>
                    {t('MC')}
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}
