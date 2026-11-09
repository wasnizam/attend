import { useEffect, useRef } from 'react'
import { syncHolidays } from '../data/classes'
import { useProfile } from '../hooks/useAuth'
import { useEditableClasses } from '../hooks/useClasses'
import { getHolidaySetting, signatureFor } from '../lib/holidays'
import { t } from '../lib/i18n'

/**
 * Keeps every class (or shift) this person can edit in line with the organisation's public
 * holidays, in the background. Draws nothing. Only out-of-date classes are written, so on most
 * visits it does nothing at all.
 */
export function HolidaySync() {
  const profile = useProfile()
  const classes = useEditableClasses()
  const running = useRef(false)
  const setting = getHolidaySetting()
  const key = JSON.stringify(setting)
  useEffect(() => {
    const list = classes.data ?? []
    const stale = list.filter((c) => (c.holidaySync ?? 'none') !== signatureFor(c, setting))
    if (!stale.length || running.current) return
    running.current = true
    syncHolidays(profile, stale, t('Public holiday'))
      .catch(() => {})
      .finally(() => {
        running.current = false
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes.data, key, profile.id])
  return null
}
