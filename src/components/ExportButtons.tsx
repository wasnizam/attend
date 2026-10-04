import { type Absentee, attendanceCsv, downloadCsv } from '../lib/csv'
import { t } from '../lib/i18n'
import type { AttendanceRecord, Session } from '../lib/types'
import { Button } from './ui'

export function ExportButtons({ records, filename, absent = [], outs, session }: { records: AttendanceRecord[]; filename: string; absent?: Absentee[]; outs?: Map<string, { toMillis(): number }>; session?: Session }) {
  const none = records.length + absent.length === 0
  const save = (excel: boolean) =>
    downloadCsv(`${filename}${excel ? '-excel' : ''}.csv`, attendanceCsv(records, absent, outs, session), excel)
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" disabled={none} onClick={() => save(false)}>
        {t('Export CSV')}
      </Button>
      <Button variant="secondary" disabled={none} onClick={() => save(true)}>
        {t('Export for Excel')}
      </Button>
    </div>
  )
}
