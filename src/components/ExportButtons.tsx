import { type Absentee, attendanceCsv, downloadCsv } from '../lib/csv'
import { t } from '../lib/i18n'
import type { AttendanceRecord } from '../lib/types'
import { Button } from './ui'

export function ExportButtons({ records, filename, absent = [] }: { records: AttendanceRecord[]; filename: string; absent?: Absentee[] }) {
  const none = records.length + absent.length === 0
  const save = (excel: boolean) =>
    downloadCsv(`${filename}${excel ? '-excel' : ''}.csv`, attendanceCsv(records, absent), excel)
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
