import { type FormEvent, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ListUploader } from '../components/ListUploader'
import { Button, Card, EmptyState, ErrorNote, Field, PageLoader, friendlyError } from '../components/ui'
import { type Phones, resetPhone, subscribePhones } from '../data/phones'
import { addToRoster, removeFromRoster } from '../data/roster'
import { useLive } from '../hooks/useLive'
import { useMyClasses } from '../hooks/useClasses'
import { useRoster } from '../hooks/useRoster'
import { downloadCsv, rosterCsv, slug } from '../lib/csv'
import { studentKey } from '../lib/format'
import { t } from '../lib/i18n'
import { has } from '../lib/purpose'
import type { WeeklyClass } from '../lib/types'

export function Roster() {
  const { classId } = useParams()
  const classes = useMyClasses()
  if (classes.loading) return <PageLoader />
  const cls = classes.data?.find((c) => c.id === classId)
  if (!cls) {
    return (
      <EmptyState
        title={t('Class not found')}
        text={t('It may have been removed from your timetable.')}
        action={<Link to="/app/timetable" className="font-medium text-accent">{t('Back to timetable')}</Link>}
      />
    )
  }
  return <RosterEditor key={cls.id} cls={cls} />
}

function RosterEditor({ cls }: { cls: WeeklyClass }) {
  const roster = useRoster(cls.id, cls.organisationId)
  const [newId, setNewId] = useState('')
  const [newName, setNewName] = useState('')
  const [newDept, setNewDept] = useState('')
  const withDept = has('clock')
  // Workplace: who has a registered phone, so a lost or replaced one can be forgotten.
  const phones = useLive<Phones>(withDept ? (onData, onError) => subscribePhones(cls.organisationId, onData, onError) : null, [cls.organisationId, withDept])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const current = roster.data ?? []

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

  const addOne = (e: FormEvent) => {
    e.preventDefault()
    const key = studentKey(newId)
    if (!key || !newName.trim()) return
    run(async () => {
      await addToRoster(cls, [{ studentKey: key, studentId: newId.trim().toUpperCase(), studentName: newName.trim(), ...(newDept.trim() ? { department: newDept.trim() } : {}) }], current)
      setNewId('')
      setNewName('')
    })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link to="/app/timetable" className="text-sm font-medium text-accent">‹ {t('Timetable')}</Link>
        <p className="mt-2 text-sm text-muted">{cls.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('Student list')}</h1>
      </div>

      <ErrorNote>{error}</ErrorNote>

      <ListUploader cls={cls} current={current} after={<Link to="/app" className="font-semibold underline">{t('Done, back to Today')}</Link>} />

      <Card className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">
            {t('On the list')} <span className="tabular font-normal text-muted">· {current.length}</span>
          </h2>
          {current.length > 0 && (
            <button onClick={() => downloadCsv(`${slug(cls.name)}-list-excel.csv`, rosterCsv(current), true)} className="ml-auto text-sm font-medium text-accent">
              {t('Export list')}
            </button>
          )}
          {current.length > 0 && (
            <button
              disabled={busy}
              onClick={() => {
                if (window.confirm(t('Remove all {n} students from this list? Past attendance is kept.', { n: current.length }))) {
                  run(() => removeFromRoster(cls, current.map((s) => s.studentKey)))
                }
              }}
              className="text-sm font-medium text-bad"
            >
              {t('Remove all')}
            </button>
          )}
        </div>
        <form onSubmit={addOne} className={`mt-4 grid gap-2 sm:items-end ${withDept ? 'sm:grid-cols-[9rem_1fr_10rem_auto]' : 'sm:grid-cols-[10rem_1fr_auto]'}`}>
          <Field label={t('Student ID')} maxLength={40} value={newId} onChange={(e) => setNewId(e.target.value)} />
          <Field label={t('Name')} maxLength={80} value={newName} onChange={(e) => setNewName(e.target.value)} />
          {withDept && <Field label={t('Department')} hint={t('Optional')} maxLength={60} value={newDept} onChange={(e) => setNewDept(e.target.value)} />}
          <Button type="submit" variant="secondary" className="!h-12" disabled={busy || !newId.trim() || !newName.trim()}>{t('Add')}</Button>
        </form>
        <div className="mt-4">
          {roster.loading ? (
            <PageLoader />
          ) : roster.error ? (
            <ErrorNote>{t('The list could not be loaded. Check your connection and reload.')}</ErrorNote>
          ) : current.length === 0 ? (
            <p className="rounded-lg bg-canvas px-4 py-6 text-center text-sm text-muted">
              {t('No list yet. Without one, students type their own ID and name when they check in.')}
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line text-sm">
              {current.map((s) => (
                <li key={s.studentKey} className="flex items-center gap-3 py-1 pr-2 pl-4">
                  <span className="tabular w-28 shrink-0 font-medium break-all">{s.studentId}</span>
                  <span className="min-w-0 flex-1 break-words">
                    {s.studentName}
                    {s.department && <span className="block text-xs text-muted">{s.department}</span>}
                  </span>
                  {phones.data?.byStaff.has(s.studentKey) && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(t('Forget {name}’s phone? Their next clock-in registers the phone they use then.', { name: s.studentName }))) {
                          run(() => resetPhone(cls.organisationId, s.studentKey, phones.data!))
                        }
                      }}
                      className="shrink-0 text-xs font-medium text-muted hover:text-ink"
                    >
                      {t('Reset phone')}
                    </button>
                  )}
                  <button
                    disabled={busy}
                    aria-label={t('Remove {name}', { name: s.studentName })}
                    onClick={() => run(() => removeFromRoster(cls, [s.studentKey]))}
                    className="size-9 shrink-0 rounded-md text-muted hover:bg-bad-soft hover:text-bad"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  )
}
