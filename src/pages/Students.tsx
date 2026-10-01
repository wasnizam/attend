import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { STATUS_LABEL } from '../components/AttendanceList'
import { ListUploader } from '../components/ListUploader'
import { EmptyState, ErrorNote, PageLoader, Spinner, buttonClass, inputClass } from '../components/ui'
import { fetchSessionAttendance } from '../data/attendance'
import { useProfile } from '../hooks/useAuth'
import { useMyClasses } from '../hooks/useClasses'
import { useRoster } from '../hooks/useRoster'
import { useMySessions, usePresentCount } from '../hooks/useSessions'
import { courseLine, formatDate, formatDays } from '../lib/format'
import { t } from '../lib/i18n'
import type { AttendanceRecord, Session, WeeklyClass } from '../lib/types'

interface Person {
  key: string
  studentId: string
  studentName: string
  note?: string
}

const matches = (p: Person, q: string) => !q || p.studentId.toLowerCase().includes(q) || p.studentName.toLowerCase().includes(q)

/** One collapsible group: a class or an event, with the people in it. */
function Group({ title, subtitle, count, open, onToggle, actions, children }: {
  title: string
  subtitle: string
  count: string
  open: boolean
  onToggle: () => void
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <li className="overflow-hidden rounded-xl bg-white shadow-card">
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-50">
        <svg viewBox="0 0 24 24" className={`size-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m9 6 6 6-6 6" />
        </svg>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{title}</span>
          <span className="block truncate text-sm text-muted">{subtitle}</span>
        </span>
        <span className="tabular shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{count}</span>
      </button>
      {open && (
        <div className="border-t border-line">
          {actions && <div className="flex flex-wrap gap-2 px-5 pt-4">{actions}</div>}
          <div className="p-5 pt-4">{children}</div>
        </div>
      )}
    </li>
  )
}

function People({ people, empty }: { people: Person[]; empty: string }) {
  if (people.length === 0) return <p className="rounded-lg bg-canvas px-4 py-5 text-center text-sm text-muted">{empty}</p>
  return (
    <ul className="divide-y divide-line rounded-lg text-sm shadow-card">
      {people.map((p) => (
        <li key={p.key} className="flex items-center gap-3 px-4 py-2.5">
          <span className="tabular w-28 shrink-0 font-medium whitespace-nowrap">{p.studentId}</span>
          <span className="min-w-0 flex-1 break-words">{p.studentName}</span>
          {p.note && <span className="shrink-0 text-xs text-muted">{p.note}</span>}
        </li>
      ))}
    </ul>
  )
}

/** A semester class and the students on its list. */
function ClassGroup({ cls, query, open, onToggle }: { cls: WeeklyClass; query: string; open: boolean; onToggle: () => void }) {
  // The list is only fetched once the group is opened, or while searching.
  const roster = useRoster(open || query ? cls.id : null, cls.organisationId)
  const people = (roster.data ?? [])
    .map((s) => ({ key: s.studentKey, studentId: s.studentId, studentName: s.studentName }))
    .filter((p) => matches(p, query))
  if (query && !roster.loading && people.length === 0) return null
  return (
    <Group
      title={cls.name}
      subtitle={[courseLine(cls), formatDays(cls.days)].filter(Boolean).join(' · ')}
      count={query ? String(people.length) : cls.rosterCount ? t('{n} students', { n: cls.rosterCount }) : t('Upload a list')}
      open={open || Boolean(query)}
      onToggle={onToggle}
      actions={
        <>
          <Link to={`/app/timetable/${cls.id}/students`} className={buttonClass({ variant: 'secondary' })}>
            {t('Edit list')}
          </Link>
          <Link to={`/app/timetable/${cls.id}/report`} className={buttonClass({ variant: 'secondary' })}>
            {t('Semester report')}
          </Link>
        </>
      }
    >
      {roster.loading ? (
        <Spinner />
      ) : roster.error ? (
        <ErrorNote>{t('The list could not be loaded. Check your connection and reload.')}</ErrorNote>
      ) : (
        <div className="space-y-4">
          {!query && <ListUploader cls={cls} current={roster.data ?? []} />}
          <People people={people} empty={t('No list yet. Without one, students type their own ID and name when they check in.')} />
        </div>
      )}
    </Group>
  )
}

/** A one-off session or event and the people who were recorded at it. */
function EventGroup({ session, query, open, onToggle }: { session: Session; query: string; open: boolean; onToggle: () => void }) {
  const viewer = useProfile()
  const [records, setRecords] = useState<AttendanceRecord[] | null>(null)
  const [failed, setFailed] = useState(false)
  const wanted = open || Boolean(query)
  // A session that is still running has no stored headcount yet, so it is counted live.
  const stored = usePresentCount(session, viewer)
  useEffect(() => {
    if (!wanted || records) return
    let stale = false
    fetchSessionAttendance(session, viewer).then(
      (r) => !stale && setRecords(r.sort((a, b) => a.studentName.localeCompare(b.studentName))),
      () => !stale && setFailed(true),
    )
    return () => {
      stale = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, session.id])

  const people = (records ?? [])
    .map((r) => ({ key: r.id, studentId: r.studentId, studentName: r.studentName, note: t(STATUS_LABEL[r.status ?? 'present']) }))
    .filter((p) => matches(p, query))
  if (query && records && people.length === 0) return null
  return (
    <Group
      title={session.name}
      subtitle={[formatDate(session.date), courseLine(session)].filter(Boolean).join(' · ')}
      count={query && records ? String(people.length) : ((n: number) => t(n === 1 ? '{n} participant' : '{n} participants', { n }))(records ? records.length : stored)}
      open={wanted}
      onToggle={onToggle}
      actions={
        <Link to={`/app/session/${session.id}`} className={buttonClass({ variant: 'secondary' })}>
          {t('Open attendance record')}
        </Link>
      }
    >
      {failed ? (
        <ErrorNote>{t('The attendance record could not be loaded.')}</ErrorNote>
      ) : !records ? (
        <Spinner />
      ) : (
        <People people={people} empty={t('Nobody checked in')} />
      )}
    </Group>
  )
}

/** Everyone the lecturer teaches or has hosted, grouped by class and by event. */
export function Students() {
  const classes = useMyClasses()
  const sessions = useMySessions()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const query = search.trim().toLowerCase()

  if (classes.loading || sessions.loading) return <PageLoader />
  if (classes.error || sessions.error) return <ErrorNote>{t('We could not load this data. Check your connection and reload.')}</ErrorNote>

  const myClasses = classes.data ?? []
  // Events: sessions that are not a meeting of a semester class and have actually run.
  const events = (sessions.data ?? []).filter((s) => !s.classId && s.status !== 'scheduled').slice(0, 50)
  const toggle = (id: string) => setOpen((cur) => (cur === id ? null : id))

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">{t('By class and by event')}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('Students')}</h1>
      </div>

      {myClasses.length + events.length === 0 ? (
        <EmptyState
          title={t('No students yet')}
          text={t('Add a class and upload its student list, or run a session. Everyone will be listed here.')}
          action={
            <Link to="/app/new?weekly=1" className={buttonClass({ size: 'lg' })}>
              {t('Add a semester class')}
            </Link>
          }
        />
      ) : (
        <>
          {myClasses.length === 0 && (
            <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-indigo-900">
              {t('To upload a student list, add the class first.')}{' '}
              <Link to="/app/new?weekly=1" className="font-semibold text-accent underline">{t('Add a semester class')}</Link>
            </p>
          )}
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Search by name or ID')}
            aria-label={t('Search by name or ID')}
            className={inputClass}
          />

          {myClasses.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted">{t('Classes')}</h2>
              <ul className="space-y-3">
                {myClasses.map((c) => (
                  <ClassGroup key={c.id} cls={c} query={query} open={open === c.id} onToggle={() => toggle(c.id)} />
                ))}
              </ul>
            </section>
          )}

          {events.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted">{t('Events and one-off sessions')}</h2>
              <ul className="space-y-3">
                {events.map((s) => (
                  <EventGroup key={s.id} session={s} query={query} open={open === s.id} onToggle={() => toggle(s.id)} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
