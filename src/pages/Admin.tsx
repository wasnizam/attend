import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ExportButtons } from '../components/ExportButtons'
import { Button, Card, EmptyState, ErrorNote, PageLoader, StatusBadge, friendlyError, inputClass, buttonClass } from '../components/ui'
import { getOrganisation, setUserRole, setUserStatus, subscribeOrgUsers } from '../data/account'
import { subscribeOrgAttendance } from '../data/attendance'
import { subscribeOrgSessions } from '../data/sessions'
import { useProfile } from '../hooks/useAuth'
import { useLive } from '../hooks/useLive'
import { useNow } from '../hooks/useSessions'
import { handOver, subscribeOrgClasses } from '../data/classes'
import { PhoneReview } from '../components/PhoneReview'
import { t } from '../lib/i18n'
import { has } from '../lib/purpose'
import { addDays, classSlots, countPresent, endOf, formatDays, isAway, effectiveStatus, formatClock24, formatDate, formatPercent, formatRange, isoDate, minutesLate, percent, headcount } from '../lib/format'
import type { AttendanceRecord, Organisation, Session, UserProfile, WeeklyClass } from '../lib/types'

const TABS = ['overview', 'sessions', 'records', 'phones', 'users'] as const
type Tab = (typeof TABS)[number]
const TAB_LABEL: Record<Tab, string> = { overview: 'Overview', sessions: 'Sessions', records: 'Records', phones: 'Phones', users: 'Users' }

const selectClass = `${inputClass} appearance-none pr-8`

function BigStat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="tabular mt-1 text-3xl font-semibold tracking-tight">{value}</p>
    </Card>
  )
}

export default function Admin() {
  const profile = useProfile()
  const org = profile.organisationId
  useNow()
  const [params, setParams] = useSearchParams()
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'overview'

  const today = isoDate()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [lecturer, setLecturer] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [search, setSearch] = useState('')

  const validRange = Boolean(from && to && from <= to)
  const sessions = useLive<Session[]>(
    validRange ? (d, e) => subscribeOrgSessions(org, from, to, d, e) : null,
    [org, from, to],
  )
  const attendance = useLive<AttendanceRecord[]>(
    validRange ? (d, e) => subscribeOrgAttendance(org, from, to, d, e) : null,
    [org, from, to],
  )
  const users = useLive<UserProfile[]>((d, e) => subscribeOrgUsers(org, d, e), [org])
  const [organisation, setOrganisation] = useState<Organisation | null>(null)
  useEffect(() => {
    getOrganisation(org).then(setOrganisation, () => {})
  }, [org])

  const q = search.trim().toLowerCase()
  const allSessions = sessions.data ?? []
  const allRecords = attendance.data ?? []

  const view = useMemo(() => {
    const presentBy = new Map<string, number>()
    for (const r of allRecords) {
      if (!isAway(r.status)) presentBy.set(r.sessionId, (presentBy.get(r.sessionId) ?? 0) + 1)
    }

    const inScope = allSessions.filter((s) => !lecturer || s.ownerId === lecturer)
    const scopeIds = new Set(inScope.map((s) => s.id))
    const scopedRecords = allRecords.filter((r) => scopeIds.has(r.sessionId))

    // Sessions without an expected headcount count their actual attendees as participants.
    const participants = inScope.reduce((sum, s) => sum + (s.expected ?? presentBy.get(s.id) ?? 0), 0)
    const present = countPresent(scopedRecords)

    const byLecturer = new Map<string, { name: string; sessions: number; participants: number; present: number }>()
    for (const s of inScope) {
      const row = byLecturer.get(s.ownerId) ?? { name: s.ownerName, sessions: 0, participants: 0, present: 0 }
      row.sessions += 1
      row.participants += s.expected ?? presentBy.get(s.id) ?? 0
      row.present += presentBy.get(s.id) ?? 0
      byLecturer.set(s.ownerId, row)
    }

    return {
      presentBy,
      inScope,
      participants,
      present,
      byLecturer: [...byLecturer.values()].sort((a, b) => a.name.localeCompare(b.name)),
      sessionRows: inScope.filter((s) => !q || s.name.toLowerCase().includes(q) || s.ownerName.toLowerCase().includes(q)),
      recordRows: scopedRecords.filter(
        (r) =>
          (!sessionId || r.sessionId === sessionId) &&
          (!q || r.studentId.toLowerCase().includes(q) || r.studentName.toLowerCase().includes(q)),
      ),
    }
  }, [allSessions, allRecords, lecturer, sessionId, q])

  const preset = (days: number) => {
    setFrom(addDays(today, -(days - 1)))
    setTo(today)
    setSessionId('')
  }
  const activePreset = to === today ? [1, 7, 30].find((d) => from === addDays(today, -(d - 1))) : undefined
  const rangeLabel = from === to ? (from === today ? t('Today') : formatDate(from)) : `${formatDate(from)} – ${formatDate(to)}`

  const loading = sessions.loading || attendance.loading
  const failed = sessions.error || attendance.error

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">{organisation?.name ?? ' '}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{t('Admin')}</h1>
        {has('clock') && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/app/reports" className={buttonClass({ variant: 'secondary' })}>{t('Monthly report')}</Link>
            <Link to="/app/account" className={buttonClass({ variant: 'secondary' })}>{t('Company settings')}</Link>
          </div>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-md bg-white p-1 shadow-card sm:w-fit">
        {TABS.filter((tb) => tb !== 'phones' || has('clock')).map((tb) => (
          <button
            key={tb}
            onClick={() => {
              setSearch('')
              setParams(tb === 'overview' ? {} : { tab: tb }, { replace: true })
            }}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition sm:flex-none ${tab === tb ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}
          >
            {t(TAB_LABEL[tb])}
          </button>
        ))}
      </div>

      {tab !== 'users' && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {[1, 7, 30].map((d) => (
              <button
                key={d}
                onClick={() => preset(d)}
                className={`rounded-md px-3.5 py-1.5 text-sm font-medium ${activePreset === d ? 'bg-accent-soft text-accent' : 'bg-canvas text-muted hover:text-ink'}`}
              >
                {d === 1 ? t('Today') : t('Last {n} days', { n: d })}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-xs font-medium text-muted">
              {t('From')}
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} mt-1`} />
            </label>
            <label className="block text-xs font-medium text-muted">
              {t('To')}
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={`${inputClass} mt-1`} />
            </label>
            <label className="block text-xs font-medium text-muted">
              {t('Lecturer')}
              <select value={lecturer} onChange={(e) => { setLecturer(e.target.value); setSessionId('') }} className={`${selectClass} mt-1`}>
                <option value="">{t('All lecturers')}</option>
                {(users.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </label>
            {tab === 'records' && (
              <label className="block text-xs font-medium text-muted">
                {t('Session')}
                <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className={`${selectClass} mt-1`}>
                  <option value="">{t('All sessions')}</option>
                  {view.inScope.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} · {formatDate(s.date)}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {(tab === 'sessions' || tab === 'records') && (
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === 'sessions' ? t('Search sessions') : t('Search participants by name or ID')}
              aria-label={tab === 'sessions' ? t('Search sessions') : t('Search participants')}
              className={inputClass}
            />
          )}
        </Card>
      )}

      {tab !== 'users' && !validRange && <ErrorNote>{t('Choose a start date that is on or before the end date.')}</ErrorNote>}
      {tab !== 'users' && failed && <ErrorNote>{t('We could not load this data. Check your connection and reload.')}</ErrorNote>}
      {tab !== 'users' && validRange && !failed && loading && <PageLoader />}

      {tab === 'overview' && validRange && !failed && !loading && has('clock') && <CompanyDay sessions={view.inScope} records={allRecords} rangeLabel={rangeLabel} />}
      {tab === 'overview' && validRange && !failed && !loading && !has('clock') && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <BigStat label={from === to && from === today ? t('Sessions Today') : t('Sessions')} value={view.inScope.length} />
            <BigStat label={t('Participants')} value={view.participants} />
            <BigStat label={t('Present')} value={view.present} />
            <BigStat label={t('Attendance Rate')} value={formatPercent(percent(view.present, view.participants))} />
          </div>
          {view.byLecturer.length === 0 ? (
            <EmptyState title={t('No sessions in this period')} text={t('Nothing was scheduled for {range}.', { range: rangeLabel })} />
          ) : (
            <Card className="overflow-hidden">
              <h2 className="px-5 pt-5 text-sm font-semibold text-muted">{t('By lecturer')} · {rangeLabel}</h2>
              <ul className="mt-2 divide-y divide-line">
                {view.byLecturer.map((l) => (
                  <li key={l.name} className="flex items-center justify-between gap-4 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{l.name}</p>
                      <p className="text-sm text-muted">{t(l.sessions === 1 ? '{n} session' : '{n} sessions', { n: l.sessions })}</p>
                    </div>
                    <p className="tabular shrink-0 text-right text-sm">
                      <span className="font-semibold">{l.present} / {l.participants}</span>
                      <span className="ml-2 text-muted">{formatPercent(percent(l.present, l.participants))}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {tab === 'sessions' && validRange && !failed && !loading &&
        (view.sessionRows.length === 0 ? (
          <EmptyState title={t('No sessions found')} text={t('Try a wider date range or a different search.')} />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl bg-white shadow-card">
            {view.sessionRows.map((s) => {
              const present = view.presentBy.get(s.id) ?? 0
              return (
                <li key={s.id}>
                  <Link to={`/app/session/${s.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-canvas/60">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{s.name}</p>
                      <p className="truncate text-sm text-muted">{formatDate(s.date)} · {formatRange(s)} · {s.ownerName}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular font-semibold">
                        {present}{headcount(present, s.expected) ? ` / ${s.expected}` : ''}
                        <span className="ml-2 font-normal text-muted">{formatPercent(percent(present, headcount(present, s.expected)))}</span>
                      </p>
                      <div className="mt-1"><StatusBadge status={effectiveStatus(s)} /></div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        ))}

      {tab === 'records' && validRange && !failed && !loading && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {t('{n} records', { n: view.recordRows.length })} · {rangeLabel}
            </p>
            <ExportButtons records={view.recordRows} filename={`attendance-${from}${from === to ? '' : `-to-${to}`}`} />
          </div>
          {view.recordRows.length === 0 ? (
            <EmptyState title={t('No attendance records')} text={t('Try a wider date range or a different search.')} />
          ) : (
            <div className="overflow-x-auto rounded-xl bg-white shadow-card">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-line">
                    {['Student ID', 'Name', 'Session', 'Date', 'Time'].map((h) => (
                      <th key={h} className="px-5 py-3 font-medium">{t(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {view.recordRows.slice(0, 500).map((r) => (
                    <tr key={r.id}>
                      <td className="tabular px-5 py-3 font-medium">{r.studentId}</td>
                      <td className="px-5 py-3">{r.studentName}</td>
                      <td className="px-5 py-3">
                        <Link to={`/app/session/${r.sessionId}`} className="hover:underline">{r.sessionName}</Link>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap text-muted">{formatDate(r.date)}</td>
                      <td className="tabular px-5 py-3 text-muted">{formatClock24(r.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {view.recordRows.length > 500 && (
                <p className="border-t border-line px-5 py-3 text-sm text-muted">
                  {t('Showing the first 500. Export to get all {n}.', { n: view.recordRows.length })}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'phones' && has('clock') && validRange && !failed && !loading && <PhoneReview records={attendance.data ?? []} rangeLabel={rangeLabel} listOf={new Map(allSessions.map((x) => [x.id, x.rosterId ?? '']))} />}

      {tab === 'users' && <Users users={users} organisation={organisation} me={profile.id} />}
    </div>
  )
}

function Users({ users, organisation, me }: { users: ReturnType<typeof useLive<UserProfile[]>>; organisation: Organisation | null; me: string }) {
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const inviteUrl = organisation ? `${window.location.origin}/signup?join=${organisation.inviteCode}` : ''

  const run = (fn: () => Promise<void>) => {
    setError('')
    fn().catch((e) => setError(friendlyError(e)))
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError(t('Could not copy. Select the link and copy it manually.'))
    }
  }

  if (users.loading) return <PageLoader />
  if (users.error) return <ErrorNote>{t('We could not load users. Check your connection and reload.')}</ErrorNote>

  return (
    <div className="space-y-4">
      {has('clock') && <Offices />}
      {organisation && (
        <Card className="p-5">
          <h2 className="font-semibold">{t('Invite lecturers')}</h2>
          <p className="mt-1 text-sm text-muted">
            {t('Share this link. Anyone who signs up with it joins {name} as a lecturer.', { name: organisation.name })}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input readOnly value={inviteUrl} onFocus={(e) => e.target.select()} aria-label={t('Invite link')} className={inputClass} />
            <Button variant="secondary" onClick={copy} className="shrink-0">
              {copied ? t('Copied') : t('Copy link')}
            </Button>
          </div>
          <p className="mt-2 text-sm text-muted">
            {t('Invite code')}: <span className="tabular font-semibold text-ink">{organisation.inviteCode}</span>
          </p>
        </Card>
      )}
      <ErrorNote>{error}</ErrorNote>
      <ul className="divide-y divide-line overflow-hidden rounded-xl bg-white shadow-card">
        {(users.data ?? []).map((u) => (
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <p className="truncate font-semibold">
                {u.name}
                {u.id === me && <span className="ml-2 text-sm font-normal text-muted">{t('You')}</span>}
              </p>
              <p className="truncate text-sm text-muted">{u.email}</p>
            </div>
            <div className="flex items-center gap-2">
              {u.status === 'disabled' && <span className="rounded-md bg-bad-soft px-2.5 py-1 text-xs font-semibold text-bad">{t('Disabled')}</span>}
              <select
                value={u.role}
                disabled={u.id === me}
                aria-label={t('Role for {name}', { name: u.name })}
                onChange={(e) => run(() => setUserRole(u.id, e.target.value as UserProfile['role']))}
                className="h-10 rounded-md border border-line bg-white px-3 text-sm font-medium disabled:opacity-60"
              >
                <option value="lecturer">{t('Lecturer')}</option>
                <option value="admin">{t('Admin')}</option>
              </select>
              {u.id !== me && (
                <Button
                  variant="secondary"
                  className="!h-10"
                  onClick={() => run(() => setUserStatus(u.id, u.status === 'active' ? 'disabled' : 'active'))}
                >
                  {u.status === 'active' ? t('Disable') : t('Enable')}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * A workplace admin's view of the whole company: for each office, how many were expected,
 * came, were late, were away with leave or MC, and were absent.
 */
function CompanyDay({ sessions, records, rangeLabel }: { sessions: Session[]; records: AttendanceRecord[]; rangeLabel: string }) {
  type Row = { office: string; days: number; expected: number; came: number; late: number; away: number; absent: number }
  const byOffice = new Map<string, Row>()
  const recordsOf = new Map<string, AttendanceRecord[]>()
  for (const r of records) recordsOf.set(r.sessionId, [...(recordsOf.get(r.sessionId) ?? []), r])
  for (const s of sessions) {
    const office = s.venue || s.name
    const row = byOffice.get(office) ?? { office, days: 0, expected: 0, came: 0, late: 0, away: 0, absent: 0 }
    const list = recordsOf.get(s.id) ?? []
    const came = list.filter((r) => !isAway(r.status))
    row.days += 1
    row.expected += s.expected ?? came.length
    row.came += came.length
    row.late += came.filter((r) => r.status === 'late' || (r.method !== 'manual' && minutesLate(r.timestamp, s) > 0)).length
    row.away += list.length - came.length
    // Absence is only judged once the day is over.
    if (endOf(s).getTime() <= Date.now() && s.expected) row.absent += Math.max(0, s.expected - list.length)
    byOffice.set(office, row)
  }
  const rows = [...byOffice.values()].sort((a, b) => a.office.localeCompare(b.office))
  const total = rows.reduce((a, r) => ({ ...a, expected: a.expected + r.expected, came: a.came + r.came, late: a.late + r.late, away: a.away + r.away, absent: a.absent + r.absent }), { expected: 0, came: 0, late: 0, away: 0, absent: 0 })
  if (rows.length === 0) return <EmptyState title={t('Nothing recorded in these dates')} text={t('Nothing was open for {range}.', { range: rangeLabel })} />
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <BigStat label={t('Expected')} value={total.expected} />
        <BigStat label={t('Came')} value={total.came} />
        <BigStat label={t('Late')} value={total.late} />
        <BigStat label={t('On leave or MC')} value={total.away} />
        <BigStat label={t('Absent')} value={total.absent} />
      </div>
      <Card className="overflow-x-auto">
        <h2 className="px-5 pt-5 text-sm font-semibold text-muted">{t('By office')} · {rangeLabel}</h2>
        <table className="mt-2 w-full min-w-[36rem] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-2 pr-2 pl-5 font-medium">{t('Office')}</th>
              {['Expected', 'Came', 'Late', 'On leave or MC', 'Absent'].map((h) => (
                <th key={h} className="px-2 py-2 text-right font-medium last:pr-5">{t(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.office}>
                <td className="py-3 pr-2 pl-5 font-medium">{r.office}</td>
                <td className="px-2 py-3 text-right">{r.expected}</td>
                <td className="px-2 py-3 text-right font-semibold">{r.came}</td>
                <td className={`px-2 py-3 text-right ${r.late ? 'text-[#b25e00]' : ''}`}>{r.late}</td>
                <td className="px-2 py-3 text-right">{r.away}</td>
                <td className={`py-3 pr-5 pl-2 text-right ${r.absent ? 'font-semibold text-bad' : ''}`}>{r.absent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-sm text-muted">{t('Absent counts people on a staff list who did not come, once their day is over. Open the monthly report for hours and overtime.')}</p>
    </div>
  )
}

/** A workplace admin's map of the company: each office, who runs it, its hours and its people. */
function Offices() {
  const profile = useProfile()
  const offices = useLive<WeeklyClass[]>((d, e) => subscribeOrgClasses(profile.organisationId, d, e), [profile.organisationId])
  const list = (offices.data ?? []).filter((c) => !c.rosterFrom)
  if (offices.loading) return null
  return (
    <Card className="overflow-hidden">
      <div className="px-5 pt-5">
        <h2 className="font-semibold">{t('Offices and who runs them')}</h2>
        <p className="mt-1 text-sm text-muted">{t('To give an office to a manager, open it with Edit and use “Who manages this office”.')}</p>
      </div>
      {list.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">{t('No offices yet.')}</p>
      ) : (
        <ul className="mt-3 divide-y divide-line text-sm">
          {list.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3">
              <span className="min-w-0">
                <span className="block font-medium">{c.venue || c.name}</span>
                <span className="block text-xs text-muted">
                  {formatDays(c.days)} · {formatRange(classSlots(c)[0])} · {t('{n} staff', { n: c.rosterCount ?? 0 })}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-xs text-muted">{t('Run by')}</span>
                <span className="font-medium">{c.ownerId === profile.id ? t('You') : c.ownerName}</span>
                <span className="mt-1 flex justify-end gap-3 text-xs font-semibold">
                  <Link to={`/app/timetable/${c.id}`} className="text-accent hover:underline">{t('Edit')}</Link>
                  <Link to={`/app/timetable/${c.id}/students`} className="text-accent hover:underline">{t('Staff list')}</Link>
                  {c.ownerId !== profile.id && (
                    <button
                      className="text-accent hover:underline"
                      onClick={() => {
                        if (window.confirm(t('Take “{name}” back from {person}? From its next day, you run it.', { name: c.venue || c.name, person: c.ownerName }))) handOver(c, profile).catch(() => {})
                      }}
                    >
                      {t('Take back')}
                    </button>
                  )}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
