import { useEffect, useState } from 'react'
import { type LiveAnnouncement, subscribeLiveAnnouncements } from '../data/announcements'
import { isoDate } from '../lib/format'
import { t } from '../lib/i18n'
import { getPurpose } from '../lib/purpose'

const KEY = 'attend.closedAnnouncements'
const closed = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

/** The Attend team's current messages for this kind of customer; each can be closed. */
export function AnnouncementBanner() {
  const [rows, setRows] = useState<LiveAnnouncement[]>([])
  const [hidden, setHidden] = useState<string[]>(closed)
  useEffect(() => subscribeLiveAnnouncements(setRows), [])
  const today = isoDate()
  const purpose = getPurpose()
  const shown = rows.filter((a) => a.active && a.from <= today && a.to >= today && (a.audience === 'all' || a.audience === purpose) && !hidden.includes(a.id))
  if (!shown.length) return null
  const close = (id: string) => {
    const next = [...hidden, id]
    setHidden(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next.slice(-50)))
    } catch {
      // Not remembered; it shows again next time.
    }
  }
  return (
    <div className="space-y-2 print:hidden">
      {shown.map((a) => (
        <div key={a.id} role="status" className={`flex items-start justify-between gap-3 rounded-lg px-4 py-2.5 text-sm ${a.level === 'warning' ? 'bg-[#fff4d6] text-[#8a5a00]' : 'bg-accent-soft text-indigo-900'}`}>
          <p><span className="font-semibold">{a.title}</span> {a.body}</p>
          <button type="button" onClick={() => close(a.id)} className="shrink-0 opacity-70 hover:opacity-100" aria-label={t('Close')}>×</button>
        </div>
      ))}
    </div>
  )
}
