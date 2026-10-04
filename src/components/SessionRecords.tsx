import { type FormEvent, useState } from 'react'
import { type ClockOuts, clockOutFor, markManually, removeAttendance, setAttendanceStatus, subscribeClockOuts, subscribeLocations, undoClockOut } from '../data/attendance'
import { type Evidence, saveEvidence, subscribeEvidence } from '../data/evidence'
import { useProfile } from '../hooks/useAuth'
import { missedChecks, useCheckins } from '../hooks/useCheckins'
import { useLive } from '../hooks/useLive'
import { useAbsentees } from '../hooks/useRoster'
import { useNow } from '../hooks/useSessions'
import { openEvidence } from '../lib/evidenceFile'
import { type Phones, approvePhone, phoneNote, subscribePhones } from '../data/phones'
import { isAway, minutesEarly, minutesLate, studentKey as studentKeyOf } from '../lib/format'
import { has } from '../lib/purpose'
import { type Position, distanceMetres, formatDistance } from '../lib/geo'
import { t } from '../lib/i18n'
import type { AttendanceRecord, AttendanceStatus, Session } from '../lib/types'
import { AbsentList } from './AbsentList'
import { AttendanceList } from './AttendanceList'
import { EvidenceDialog } from './EvidenceDialog'
import { Button, EmptyState, ErrorNote, friendlyError, inputClass } from './ui'

interface Props {
  session: Session
  records: AttendanceRecord[]
  live?: boolean
  /** Text for the empty state. */
  emptyTitle: string
  emptyText: string
}

/**
 * Who is on record for a session, who is not, and the lecturer's tools to put it right:
 * mark someone by hand, change present / late / excused, or remove a record.
 */
export function SessionRecords({ session, records, live = false, emptyTitle, emptyText }: Props) {
  const viewer = useProfile()
  const absentees = useAbsentees(session, records)
  const checkins = useCheckins(session)
  const missed = missedChecks(session, records, checkins.data, useNow(15_000))
  // Location check: note anyone who checked in from outside the class's radius, or
  // who did not share where they were. Students marked by hand are not asked.
  const fence = session.geoPoint
  const locations = useLive<Map<string, Position>>(
    fence ? (onData, onError) => subscribeLocations(session, viewer, onData, onError) : null,
    [session.id, session.organisationId, viewer.id, viewer.role, Boolean(fence)],
  )
  // Workplace: when each person left, and how late each arrived (worked out from the time).
  const clocking = has('clock')
  const outs = useLive<ClockOuts>(
    clocking ? (onData, onError) => subscribeClockOuts(session, viewer, onData, onError) : null,
    [session.id, session.organisationId, viewer.id, viewer.role, clocking],
  )
  const notes = new Map<string, string>()
  const note = (id: string, text: string) => notes.set(id, [notes.get(id), text].filter(Boolean).join(' · '))
  if (clocking) {
    for (const r of records) {
      if (isAway(r.status)) continue
      const late = r.method === 'manual' ? 0 : minutesLate(r.timestamp, session)
      if (late) note(r.id, t('Late by {n} min', { n: late }))
      const early = minutesEarly(outs.data?.get(r.studentKey), session)
      if (early) note(r.id, t('Left {n} min early', { n: early }))
    }
  }
  // Each person's own phone: a clock-in from another phone is worth a look.
  const phones = useLive<Phones>(clocking ? (onData, onError) => subscribePhones(session.organisationId, onData, onError) : null, [session.organisationId, clocking])
  const nameOf = (key: string) => records.find((x) => x.studentKey === key)?.studentName ?? key
  const phoneActions = new Map<string, React.ReactNode>()
  if (phones.data) {
    for (const r of records) {
      if (r.method === 'manual') continue
      const p = phoneNote(r.studentKey, r.device, phones.data)
      if (p.kind === 'other') note(r.id, t('Phone belongs to {name}', { name: nameOf(p.owner) }))
      if (p.kind === 'none') note(r.id, t('Phone not recognised'))
      if (p.kind === 'unknown') {
        note(r.id, t('Not their usual phone'))
        phoneActions.set(
          r.id,
          <button type="button" className="mt-0.5 block text-xs font-medium text-accent hover:underline" onClick={() => run(() => approvePhone(session.organisationId, r.studentKey, r.device!, viewer, phones.data?.byDevice.get(p.registered) === r.studentKey ? p.registered : undefined))}>
            {t('This is their new phone')}
          </button>,
        )
      }
    }
  }
  // One phone used for more than one person: worth a look (clocking in for a friend).
  const shared = new Map<string, AttendanceRecord[]>()
  for (const r of records) if (r.device) shared.set(r.device, [...(shared.get(r.device) ?? []), r])
  for (const [device, group] of shared) {
    // When the phone is registered, "Phone belongs to …" already says it, and its owner is fine.
    if (group.length < 2 || phones.data?.byDevice.has(device)) continue
    for (const r of group) note(r.id, t('Same phone as {name}', { name: group.filter((x) => x.id !== r.id).map((x) => x.studentName).join(', ') }))
  }
  if (fence && locations.data) {
    for (const r of records) {
      if (r.method === 'manual') continue
      const at = locations.data.get(r.studentKey)
      const add = (text: string) => notes.set(r.id, [notes.get(r.id), text].filter(Boolean).join(' · '))
      if (!at) add(t('Location not shared'))
      else {
        const far = distanceMetres(at, { lat: fence.latitude, lng: fence.longitude })
        if (far > (session.geoRadius ?? 0)) add(t('Far from class: {d} away', { d: formatDistance(far) }))
      }
    }
  }
  // Remarks and proof for MC / excused absences. `asking` is the student whose details
  // are being entered: already on record (recorded) or about to be marked.
  const evidence = useLive<Map<string, Evidence>>(
    (onData, onError) => subscribeEvidence(session, viewer, onData, onError),
    [session.id, session.organisationId, viewer.id, viewer.role],
  )
  const [asking, setAsking] = useState<{ studentId: string; studentName: string; studentKey: string; status: AttendanceStatus; recorded: boolean } | null>(null)
  const details = new Map<string, React.ReactNode>()
  for (const r of records) {
    if (!isAway(r.status)) continue
    const ev = evidence.data?.get(r.studentKey)
    details.set(
      r.id,
      <span className="mt-0.5 block text-xs">
        {(ev?.mcNumber || ev?.clinic) && (
          <span className="block font-medium text-slate-700">{[ev.mcNumber, ev.clinic].filter(Boolean).join(' · ')}</span>
        )}
        {ev?.remarks && <span className="block text-slate-600">{ev.remarks}</span>}
        <span className="flex flex-wrap gap-x-3">
          {ev?.dataUrl ? (
            <button type="button" className="font-medium text-accent hover:underline" onClick={() => openEvidence(ev.dataUrl!)}>
              {t('View evidence')}
            </button>
          ) : (
            r.status === 'mc' && <span className="font-medium text-[#b25e00]">{ev?.mcNumber ? t('Evidence missing') : t('MC details missing')}</span>
          )}
          <button
            type="button"
            className="font-medium text-accent hover:underline"
            onClick={() => setAsking({ studentId: r.studentId, studentName: r.studentName, studentKey: r.studentKey, status: r.status, recorded: true })}
          >
            {ev ? t('Edit details') : t('Add details')}
          </button>
        </span>
      </span>,
    )
  }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [id, setId] = useState('')
  const [name, setName] = useState('')

  const run = async (fn: () => Promise<unknown>) => {
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

  const addByHand = (e: FormEvent) => {
    e.preventDefault()
    if (!id.trim() || !name.trim()) return
    run(async () => {
      await markManually(session, viewer, { studentId: id, studentName: name }, 'present')
      setId('')
      setName('')
    })
  }

  return (
    <div className="space-y-3">
      <ErrorNote>{error}</ErrorNote>
      {records.length === 0 ? (
        <EmptyState title={emptyTitle} text={emptyText} />
      ) : (
        <AttendanceList
          records={records}
          live={live}
          missed={missed}
          notes={notes}
          details={new Map([...records.map((r) => [r.id, details.get(r.id) || phoneActions.get(r.id) ? <>{details.get(r.id)}{phoneActions.get(r.id)}</> : null] as const)].filter(([, v]) => v))}
          clock={
            clocking && outs.data
              ? {
                  outs: outs.data,
                  onOut: (r) => run(() => clockOutFor(session, viewer, r.studentKey)),
                  onUndo: (r) => run(() => undoClockOut(session, r.studentKey)),
                }
              : undefined
          }
          onStatus={(r, status) =>
            run(async () => {
              await setAttendanceStatus(r.id, status)
              // An MC needs its remarks and certificate: ask for them straight away.
              if (status === 'mc') setAsking({ studentId: r.studentId, studentName: r.studentName, studentKey: r.studentKey, status, recorded: true })
            })
          }
          onRemove={(r) => {
            if (window.confirm(t('Remove {name} ({id}) from this session?', { name: r.studentName, id: r.studentId }))) {
              run(() => removeAttendance(r.id))
            }
          }}
        />
      )}
      <AbsentList
        absent={absentees}
        open={!live}
        busy={busy}
        onMark={(student, status) =>
          isAway(status)
            ? setAsking({ studentId: student.studentId, studentName: student.studentName, studentKey: studentKeyOf(student.studentId), status, recorded: false })
            : run(() => markManually(session, viewer, student, status))
        }
      />
      {asking && (
        <EvidenceDialog
          student={asking}
          status={asking.status}
          current={evidence.data?.get(asking.studentKey)}
          onCancel={() => setAsking(null)}
          onSave={async (details, file) => {
            // Mark first, so a failed upload never leaves evidence without a record.
            if (!asking.recorded) await markManually(session, viewer, asking, asking.status)
            await saveEvidence(session, viewer, asking.studentId, details, file)
            setAsking(null)
          }}
        />
      )}
      <details className="rounded-lg border border-line">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold select-none">{t('Add someone by hand')}</summary>
        <form onSubmit={addByHand} className="grid gap-2 border-t border-line p-4 sm:grid-cols-[9rem_1fr_auto]">
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            maxLength={40}
            placeholder={t('Student ID')}
            aria-label={t('Student ID')}
            className={inputClass}
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder={t('Name')}
            aria-label={t('Name')}
            className={inputClass}
          />
          <Button type="submit" variant="secondary" className="!h-12" disabled={busy || !id.trim() || !name.trim()}>
            {t('Mark present')}
          </Button>
          <p className="text-xs text-muted sm:col-span-3">
            {t('For a student whose phone is not working, or someone not on the list.')}
          </p>
        </form>
      </details>
    </div>
  )
}
