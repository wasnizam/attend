import { type FormEvent, useState } from 'react'
import { Button, Card, EmptyState, inputClass } from '../components/ui'
import { type Announcement, can, deleteAnnouncement, saveAnnouncement } from '../data/platform'
import { addDays, formatDate, isoDate } from '../lib/format'
import { t } from '../lib/i18n'
import { useOwner } from './context'
import { PageHead, Section, useAction } from './ui'

const AUDIENCE: Record<Announcement['audience'], string> = { all: 'All customers', education: 'Lecturers', training: 'Trainers', workplace: 'Workplace' }

/** Banners shown inside customers' apps: maintenance, new features, price changes. */
export default function Announcements() {
  const { announcements, me } = useOwner()
  const { busy, run, messages } = useAction()
  const edit = can(me.role, 'announce')
  const blank = { title: '', body: '', level: 'info' as const, audience: 'all' as const, from: isoDate(), to: addDays(isoDate(), 7), active: true }
  const [draft, setDraft] = useState<Omit<Announcement, 'id' | 'at'> & { id?: string }>(blank)
  const today = isoDate()
  const live = (a: Announcement) => a.active && a.from <= today && a.to >= today
  const submit = (e: FormEvent) => {
    e.preventDefault()
    run('save', async () => { await saveAnnouncement(draft, me); setDraft(blank) }, draft.id ? t('Announcement updated.') : t('Announcement posted.'))
  }
  const sorted = [...announcements].sort((a, b) => Number(live(b)) - Number(live(a)) || b.from.localeCompare(a.from))
  return (
    <>
      <PageHead title={t('Announcements')} sub={t('A banner at the top of customers’ screens, between two dates. Each person can close it.')} />
      {messages}
      <div className="grid gap-4 lg:grid-cols-5">
        {edit && (
          <Section title={draft.id ? t('Edit announcement') : t('New announcement')} className="lg:col-span-2">
            <form onSubmit={submit} className="space-y-3">
              <input required maxLength={120} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={t('Title, e.g. Scheduled maintenance')} className={inputClass} />
              <textarea required maxLength={1000} rows={3} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder={t('Message, e.g. Attend will be unavailable on Sunday 2–3 AM.')} className={inputClass} />
              <div className="grid grid-cols-2 gap-2">
                <select value={draft.level} onChange={(e) => setDraft({ ...draft, level: e.target.value as Announcement['level'] })} className={inputClass} aria-label={t('Kind')}><option value="info">{t('Information')}</option><option value="warning">{t('Warning')}</option></select>
                <select value={draft.audience} onChange={(e) => setDraft({ ...draft, audience: e.target.value as Announcement['audience'] })} className={inputClass} aria-label={t('Who sees it')}>{Object.entries(AUDIENCE).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select>
                <label className="text-xs font-medium text-muted">{t('From')}<input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className={`${inputClass} mt-1`} /></label>
                <label className="text-xs font-medium text-muted">{t('To')}<input type="date" value={draft.to} min={draft.from} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className={`${inputClass} mt-1`} /></label>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} className="size-4 accent-accent" />{t('Switched on')}</label>
              {draft.title && <Preview a={draft} />}
              <div className="flex gap-2">
                <Button type="submit" busy={busy === 'save'}>{draft.id ? t('Save') : t('Post')}</Button>
                {draft.id && <Button type="button" variant="secondary" onClick={() => setDraft(blank)}>{t('Cancel')}</Button>}
              </div>
            </form>
          </Section>
        )}
        <div className={`space-y-3 ${edit ? 'lg:col-span-3' : 'lg:col-span-5'}`}>
          {sorted.length === 0 ? (
            <EmptyState title={t('No announcements')} text={t('Post one to tell customers about maintenance or new features.')} />
          ) : (
            sorted.map((a) => (
              <Card key={a.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{a.title}</p>
                    <p className="mt-0.5 text-sm text-muted">{a.body}</p>
                    <p className="mt-1 text-xs text-muted">{t(AUDIENCE[a.audience])} · {formatDate(a.from)} – {formatDate(a.to)}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${live(a) ? 'bg-good-soft text-good' : 'bg-slate-100 text-muted'}`}>{live(a) ? t('Showing now') : a.active ? (a.from > today ? t('Scheduled') : t('Ended')) : t('Off')}</span>
                </div>
                {edit && (
                  <div className="mt-2 flex gap-3 text-xs font-medium">
                    <button type="button" className="text-accent" onClick={() => setDraft({ id: a.id, title: a.title, body: a.body, level: a.level, audience: a.audience, from: a.from, to: a.to, active: a.active })}>{t('Edit')}</button>
                    <button type="button" className="text-accent" onClick={() => run(`t${a.id}`, () => saveAnnouncement({ ...a, active: !a.active }, me), a.active ? t('Switched off.') : t('Switched on.'))}>{a.active ? t('Switch off') : t('Switch on')}</button>
                    <button type="button" className="text-bad" onClick={() => run(`d${a.id}`, () => deleteAnnouncement(a, me), t('Deleted.'), t('Delete “{title}”?', { title: a.title }))}>{t('Delete')}</button>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      </div>
    </>
  )
}

function Preview({ a }: { a: Pick<Announcement, 'title' | 'body' | 'level'> }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted">{t('Preview')}</p>
      <div className={`rounded-lg px-4 py-2.5 text-sm ${a.level === 'warning' ? 'bg-[#fff4d6] text-[#8a5a00]' : 'bg-accent-soft text-indigo-900'}`}>
        <span className="font-semibold">{a.title}</span> {a.body}
      </div>
    </div>
  )
}
