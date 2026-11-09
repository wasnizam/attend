import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cancelMeeting, recordPastClass, restoreMeeting } from '../data/classes'
import { useProfile } from '../hooks/useAuth'
import type { AgendaItem } from '../lib/agenda'
import { t } from '../lib/i18n'
import { friendlyError } from './ui'

/**
 * Cancel or restore one meeting of a semester class. Only class meetings that have not
 * been started can be cancelled; a one-off session is simply deleted instead. A past meeting
 * that was never started can also have its attendance recorded by hand.
 */
export function MeetingActions({ item }: { item: AgendaItem }) {
  const profile = useProfile()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  if (!item.due || !['planned', 'missed', 'cancelled'].includes(item.state)) return null
  const { cls, slot } = item.due

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      window.alert(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  if (item.state === 'cancelled') {
    return (
      <button disabled={busy} onClick={() => run(() => restoreMeeting(cls, item.date, slot))} className="text-sm font-medium text-accent hover:underline disabled:opacity-50">
        {t('Undo cancel')}
      </button>
    )
  }
  const cancel = (
    <button
      disabled={busy}
      onClick={() => {
        const reason = window.prompt(t('Cancel {name} on this day? You can add a reason (optional).', { name: item.name }), '')
        if (reason !== null) run(() => cancelMeeting(cls, item.date, slot, reason))
      }}
      className="text-sm font-medium text-muted hover:text-bad hover:underline disabled:opacity-50"
    >
      {item.state === 'missed' ? t('Mark as cancelled') : t('Cancel class')}
    </button>
  )
  if (item.state !== 'missed') return cancel
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        disabled={busy}
        onClick={() =>
          window.confirm(t('Record attendance for {name} by hand? The class list opens, and you tick who was there.', { name: item.name })) &&
          run(async () => navigate(`/app/session/${await recordPastClass(profile, cls, item.date, slot)}`))
        }
        className="text-sm font-medium text-accent hover:underline disabled:opacity-50"
      >
        {t('Record attendance')}
      </button>
      {cancel}
    </span>
  )
}
