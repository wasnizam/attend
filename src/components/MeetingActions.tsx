import { useState } from 'react'
import { cancelMeeting, restoreMeeting } from '../data/classes'
import type { AgendaItem } from '../lib/agenda'
import { t } from '../lib/i18n'
import { friendlyError } from './ui'

/**
 * Cancel or restore one meeting of a semester class. Only class meetings that have not
 * been started can be cancelled; a one-off session is simply deleted instead.
 */
export function MeetingActions({ item }: { item: AgendaItem }) {
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
  return (
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
}
