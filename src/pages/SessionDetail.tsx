import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ExportButtons } from '../components/ExportButtons'
import { LiveSession } from '../components/LiveSession'
import { SessionRecords } from '../components/SessionRecords'
import { Button, Card, EmptyState, ErrorNote, PageLoader, Stat, StatusBadge, friendlyError } from '../components/ui'
import { type ClockOuts, subscribeClockOuts } from '../data/attendance'
import { deleteSession, setPresentCount, startSession, subscribeSession } from '../data/sessions'
import { useProfile } from '../hooks/useAuth'
import { useLive } from '../hooks/useLive'
import { useAbsentees } from '../hooks/useRoster'
import { useNow, useSessionAttendance } from '../hooks/useSessions'
import { slug } from '../lib/csv'
import { countPresent, courseLine, effectiveStatus, formatDate, formatPercent, formatRange, percent } from '../lib/format'
import { t } from '../lib/i18n'
import { has } from '../lib/purpose'
import { rotatePref } from '../lib/prefs'
import type { AttendanceRecord, Session } from '../lib/types'

export function SessionDetail() {
  const { id = '' } = useParams()
  const profile = useProfile()
  const navigate = useNavigate()
  useNow(15_000)
  const session = useLive<Session | null>((onData, onError) => subscribeSession(id, onData, onError), [id])
  const status = session.data ? effectiveStatus(session.data) : null
  const attendance = useSessionAttendance(session.data && status !== 'scheduled' ? session.data : null, profile)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (session.loading) return <PageLoader />
  if (session.error || !session.data) {
    return (
      <EmptyState
        title={t('Session not found')}
        text={t('It may have been deleted, or it belongs to someone else.')}
        action={<Link to="/app" className="font-medium text-accent">{t('Back to today')}</Link>}
      />
    )
  }

  const s = session.data
  const mine = s.ownerId === profile.id
  const records = attendance.data ?? []
  const back = (
    <Link to={mine ? '/app' : '/admin'} className="text-sm font-medium text-accent">
      ‹ {mine ? t('Today') : t('Admin')}
    </Link>
  )

  const act = async (fn: () => Promise<unknown>) => {
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

  if (status === 'active') {
    return (
      <div className="space-y-4">
        {back}
        <ErrorNote>{error || (attendance.error && t('Live attendance could not be loaded. Check your connection.'))}</ErrorNote>
        <LiveSession session={s} records={records} owner={mine} />
      </div>
    )
  }

  if (status === 'scheduled') {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        {back}
        <Card className="p-6 text-center">
          <StatusBadge status="scheduled" />
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">{s.name}</h1>
          <p className="mt-1 text-muted">
            {formatDate(s.date)} · {formatRange(s)}
          </p>
          {courseLine(s) && <p className="mt-1 text-sm text-muted">{courseLine(s)}</p>}
          {s.description && <p className="mt-3 text-sm text-muted">{s.description}</p>}
          {s.expected && <p className="mt-3 text-sm text-muted">{t('{n} expected', { n: s.expected })}</p>}
          <div className="mt-6 space-y-3">
            <ErrorNote>{error}</ErrorNote>
            {mine ? (
              <Button size="lg" block busy={busy} onClick={() => act(() => startSession(s, rotatePref()))}>
                {t('Start Attendance')}
              </Button>
            ) : (
              <p className="text-sm text-muted">{t('Only {name} can start this session.', { name: s.ownerName })}</p>
            )}
            <Button
              variant="ghost"
              block
              disabled={busy}
              className="!text-bad hover:!bg-bad-soft"
              onClick={() => {
                if (window.confirm(t('Delete “{name}”?', { name: s.name }))) {
                  act(async () => {
                    await deleteSession(s.id)
                    navigate(mine ? '/app' : '/admin')
                  })
                }
              }}
            >
              {t('Delete session')}
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {back}
      <EndedRecord
        session={s}
        records={records}
        loading={attendance.loading}
        error={error || (attendance.error ? t('The attendance record could not be loaded.') : '')}
        mine={mine}
        busy={busy}
        onReopen={() => {
          if (window.confirm(t('Reopen attendance? A new QR is created; the old one stays closed.'))) {
            act(() => startSession(s, rotatePref()))
          }
        }}
      />
    </div>
  )
}

/** Ended: the complete attendance record, which the lecturer can still correct. */
function EndedRecord({ session: s, records, loading, error, mine, busy, onReopen }: {
  session: Session
  records: AttendanceRecord[]
  loading: boolean
  error: string
  mine: boolean
  busy: boolean
  onReopen: () => void
}) {
  const absentees = useAbsentees(s, records)
  const profile = useProfile()
  // Workplace: the export carries time out and hours as well.
  const clocking = has('clock')
  const outs = useLive<ClockOuts>(
    clocking ? (onData, onError) => subscribeClockOuts(s, profile, onData, onError) : null,
    [s.id, s.organisationId, profile.id, profile.role, clocking],
  )
  const present = loading ? s.presentCount : countPresent(records)
  const excused = loading ? 0 : records.length - present
  const pct = percent(present, s.expected)
  const absent = s.rosterId ? absentees.length : s.expected ? Math.max(0, s.expected - present - excused) : null

  // Corrections made after the session ended change the headcount shown in History.
  useEffect(() => {
    if (!loading && mine && present !== s.presentCount) setPresentCount(s.id, present).catch(() => {})
  }, [loading, mine, present, s.id, s.presentCount])

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{s.name}</h1>
          <p className="mt-1 text-muted">
            {formatDate(s.date)} · {formatRange(s)}
            {!mine && ` · ${s.ownerName}`}
          </p>
          {courseLine(s) && <p className="text-sm text-muted">{courseLine(s)}</p>}
        </div>
        <StatusBadge status="ended" />
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        <Stat label={t('Present')} value={s.expected ? `${present} / ${s.expected}` : present} />
        <Stat label={excused ? t('Absent · Excused / MC') : t('Absent')} value={absent === null ? '—' : excused ? `${absent} · ${excused}` : absent} />
        <Stat label={t('Attendance')} value={formatPercent(pct)} />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <ExportButtons records={records} absent={absentees} outs={clocking ? outs.data ?? new Map() : undefined} filename={`${slug(s.name)}-${s.date}`} />
        {mine && (
          <Button variant="secondary" busy={busy} onClick={onReopen}>
            {t('Reopen attendance')}
          </Button>
        )}
      </div>
      <div className="mt-5 space-y-3">
        <ErrorNote>{error}</ErrorNote>
        {loading ? (
          <PageLoader />
        ) : (
          <SessionRecords
            session={s}
            records={records}
            emptyTitle={t('Nobody checked in')}
            emptyText={t('No attendance was recorded for this session.')}
          />
        )}
      </div>
    </Card>
  )
}
