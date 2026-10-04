import { type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, Card, EmptyState, ErrorNote, Field, PageLoader, friendlyError, inputClass } from '../components/ui'
import { type Fence, LocationPicker } from '../components/LocationPicker'
import { subscribeOrgUsers } from '../data/account'
import { createClass, deleteClass, handOver, setClassGeofence, updateClass } from '../data/classes'
import { useLive } from '../hooks/useLive'
import type { UserProfile } from '../lib/types'
import { createSession } from '../data/sessions'
import { useProfile } from '../hooks/useAuth'
import { useEditableClasses, useMyClasses } from '../hooks/useClasses'
import { KINDS, KIND_LABEL, WEEK, addDays, classSlots, dayName, isoDate } from '../lib/format'
import { t } from '../lib/i18n'
import { overLimit } from '../lib/plan'
import { has } from '../lib/purpose'
import type { ClassKind, Delivery, Slot, WeeklyClass } from '../lib/types'

const pad = (n: number) => String(n).padStart(2, '0')

/** Defaults to the next full hour, for one hour — the common case needs no typing. */
function defaultTimes() {
  const start = Math.min(new Date().getHours() + 1, 22)
  return { startTime: `${pad(start)}:00`, endTime: `${pad(start + 1)}:00` }
}

/** Route wrapper: a blank form, or the form pre-filled with a timetable class to edit. */
export function NewSession() {
  const { classId } = useParams()
  // An admin can open any office's working hours; anyone else, their own.
  const classes = useEditableClasses()
  if (!classId) return <SessionForm />
  if (classes.loading) return <PageLoader />
  const editing = classes.data?.find((c) => c.id === classId)
  if (!editing) {
    return (
      <EmptyState
        title={t('Class not found')}
        text={t('It may have been removed from your timetable.')}
        action={<Link to="/app/timetable" className="font-medium text-accent">{t('Back to timetable')}</Link>}
      />
    )
  }
  return <SessionForm key={editing.id} editing={editing} />
}

/**
 * One short form for both kinds of session: a one-off (extra class, event) on a date,
 * or a semester class with one or more weekly meeting times.
 */
function SessionForm({ editing }: { editing?: WeeklyClass }) {
  const profile = useProfile()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // Organisations without repeating classes (events) only ever create one-off sessions.
  const canRepeat = has('recurring')
  // A workplace nearly always wants its regular hours, not a single date.
  const [weekly, setWeekly] = useState(canRepeat && (Boolean(editing) || params.has('weekly') || has('clock')))
  // An office without shifts starts from the usual week: Monday to Friday, nine to five.
  const office = has('clock') && !has('shifts')
  const [name, setName] = useState(editing?.name ?? (office ? t('Office hours') : ''))
  const [description, setDescription] = useState(editing?.description ?? '')
  const [code, setCode] = useState(editing?.code ?? '')
  const [section, setSection] = useState(editing?.section ?? '')
  const [venue, setVenue] = useState(editing?.venue ?? '')
  const [delivery, setDelivery] = useState<Delivery>(editing?.delivery ?? 'in_person')
  const [meetingUrl, setMeetingUrl] = useState(editing?.meetingUrl ?? '')
  const [kind, setKind] = useState<ClassKind>(editing?.kind ?? 'lecture')
  const [date, setDate] = useState(isoDate())
  const [{ startTime, endTime }, setTimes] = useState(defaultTimes)
  const [slots, setSlots] = useState<Slot[]>(() =>
    editing
      ? classSlots(editing)
      : office
        ? [1, 2, 3, 4, 5].map((day) => ({ day, startTime: '09:00', endTime: '17:00' }))
        : [{ day: new Date().getDay(), ...defaultTimes() }],
  )
  const [expected, setExpected] = useState(editing?.expected ? String(editing.expected) : '')
  const [rosterId, setRosterId] = useState('')
  // Workplace: how lateness and the staff list work for this shift.
  const clock = has('clock')
  const [grace, setGrace] = useState(editing?.flexible ? 'flex' : String(editing?.graceMin ?? 10))
  const [rosterFrom, setRosterFrom] = useState(editing?.rosterFrom ?? '')
  const [rotating, setRotating] = useState(Boolean(editing?.rotating))
  const [daysPerWeek, setDaysPerWeek] = useState(String(editing?.daysPerWeek ?? 6))
  const [minStaff, setMinStaff] = useState(editing?.minStaff ? String(editing.minStaff) : '')
  const [fence, setFence] = useState<Fence>(undefined)
  const [breakMin, setBreakMin] = useState(String(editing?.breakMin ?? 60))
  const [countEarly, setCountEarly] = useState(Boolean(editing?.countEarly))
  const myClasses = useMyClasses().data
  const lists = (myClasses ?? []).filter((c) => (c.rosterCount ?? 0) > 0)
  // Semester dates: default to 14 weeks from today, or to the dates of the newest class
  // already on the timetable, so a lecturer types them once per semester.
  const [semStart, setSemStart] = useState(editing?.startDate ?? isoDate())
  const [semEnd, setSemEnd] = useState(editing?.endDate ?? addDays(isoDate(), has('clock') ? 3 * 365 : 14 * 7 - 1))
  const [datesTouched, setDatesTouched] = useState(Boolean(editing))
  useEffect(() => {
    if (datesTouched) return
    const latest = [...(myClasses ?? [])]
      .filter((c) => c.endDate && c.endDate >= isoDate())
      .sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? ''))[0]
    if (latest?.startDate && latest.endDate) {
      setSemStart(latest.startDate)
      setSemEnd(latest.endDate)
    }
  }, [myClasses, datesTouched])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    document.getElementById('session-name')?.focus()
  }, [])

  const setSlot = (i: number, patch: Partial<Slot>) => setSlots((cur) => cur.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const addSlot = () =>
    setSlots((cur) => {
      const last = cur[cur.length - 1]
      // Suggest the next weekday at the same time: the usual "Mon and Wed" pattern needs one tap.
      const nextDay = WEEK[(WEEK.indexOf(last.day) + 2) % 7]
      return [...cur, { ...last, day: nextDay }]
    })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (weekly) {
      // A workplace shift may run past midnight; anywhere else an earlier end is a slip.
      if (slots.some((s) => (clock ? s.endTime === s.startTime : s.endTime <= s.startTime))) return setError(t('Each end time needs to be after its start time.'))
      const seen = new Set(slots.map((s) => `${s.day}-${s.startTime}`))
      if (seen.size !== slots.length) return setError(t('Two of the times are the same. Remove one or change it.'))
      if (semEnd < semStart) return setError(t('The semester needs to end after it starts.'))
    } else if (clock ? endTime === startTime : endTime <= startTime) {
      return setError(t('The end time needs to be after the start time.'))
    }
    if (delivery !== 'in_person' && meetingUrl.trim() && !/^https?:\/\//i.test(meetingUrl.trim())) {
      return setError(t('The meeting link should start with https://'))
    }
    const count = expected.trim() ? Number(expected) : null
    if (count !== null && (!Number.isInteger(count) || count < 1 || count > 100000)) {
      return setError(t('Expected participants should be a whole number, or left blank.'))
    }
    setBusy(true)
    try {
      const details = { name, description, code, section, venue, expected: count, delivery, meetingUrl: delivery === 'in_person' ? '' : meetingUrl }
      const work = clock ? { graceMin: grace === 'flex' ? null : Number(grace), flexible: grace === 'flex', rotating, rosterFrom: rosterFrom || null, daysPerWeek: rotating && !rosterFrom ? Number(daysPerWeek) : null, minStaff: Number(minStaff) > 0 ? Math.floor(Number(minStaff)) : null, breakMin: Number(breakMin), countEarly } : {}
      if (editing) {
        await updateClass(editing.id, { ...details, ...work, kind, slots, startDate: semStart, endDate: semEnd })
        if (clock && fence !== undefined) await setClassGeofence(editing.id, fence)
        navigate('/app/timetable')
      } else if (weekly) {
        if (overLimit('classes', (myClasses?.length ?? 0) + 1)) {
          setBusy(false)
          return setError(t('The free plan includes 1 class. Upgrade to Pro to add more.'))
        }
        const id = await createClass(profile, { ...details, ...work, kind, slots, startDate: semStart, endDate: semEnd })
        if (clock && fence) await setClassGeofence(id, fence)
        navigate(rosterFrom ? '/app/timetable' : `/app/timetable/${id}/students`)
      } else {
        const list = lists.find((c) => c.id === rosterId)
        const id = await createSession(profile, {
          ...details,
          date,
          startTime,
          endTime,
          rosterId: list?.id ?? null,
          expected: list?.rosterCount ?? count,
        })
        navigate(date === isoDate() ? '/app' : `/app/session/${id}`)
      }
    } catch (err) {
      setError(friendlyError(err))
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!editing || !window.confirm(t('Remove “{name}” from your timetable? Past attendance is kept.', { name: editing.name }))) return
    setBusy(true)
    try {
      await deleteClass(editing.id)
      navigate('/app/timetable')
    } catch (err) {
      setError(friendlyError(err))
      setBusy(false)
    }
  }

  const hasList = Boolean(editing?.rosterCount || (!weekly && rosterId))

  return (
    <div className="mx-auto max-w-lg">
      <Link to={editing ? '/app/timetable' : '/app'} className="text-sm font-medium text-accent">
        ‹ {editing ? t('Timetable') : t('Today')}
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        {editing ? t('Edit class') : weekly ? t('New semester class') : t('New session')}
      </h1>
      <Card className="mt-6 p-6">
        <form onSubmit={submit} className="space-y-4">
          {!editing && canRepeat && (
            <div>
              <div role="tablist" aria-label={t('How often')} className="grid grid-cols-2 gap-1 rounded-md bg-canvas p-1">
                {([[false, 'One-off'], [true, 'Semester class']] as const).map(([value, label]) => (
                  <button
                    key={label}
                    type="button"
                    role="tab"
                    aria-selected={weekly === value}
                    onClick={() => setWeekly(value)}
                    className={`h-10 rounded-md text-sm font-semibold transition ${weekly === value ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}
                  >
                    {t(label)}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-center text-xs text-muted">
                {weekly
                  ? t('Repeats every week of the semester. It appears on Today by itself on its days.')
                  : t('For an extra class, a workshop or an event on one date.')}
              </p>
            </div>
          )}
          <Field
            id="session-name"
            label={weekly ? t('Class name') : t('Session / class name')}
            placeholder={clock ? t('e.g. Morning shift') : t('e.g. Database Systems')}
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          {weekly && has('classKind') && (
            <div>
              <p className="mb-1.5 text-sm font-medium">{t('Class type')}</p>
              <div role="radiogroup" aria-label={t('Class type')} className="grid grid-cols-3 gap-1 rounded-md bg-canvas p-1">
                {KINDS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={kind === value}
                    onClick={() => setKind(value)}
                    className={`h-10 rounded-md text-sm font-semibold transition ${kind === value ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}
                  >
                    {t(KIND_LABEL[value])}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">{t('Attendance is reported separately for lectures, tutorials and labs.')}</p>
            </div>
          )}

          {weekly ? (
            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-sm font-medium">{t('When it meets each week')}</legend>
              {slots.map((slot, i) => (
                // Phone: day on one line, the two times under it. Wider screens: one row.
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-1.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <select
                    value={slot.day}
                    aria-label={t('Day')}
                    onChange={(e) => setSlot(i, { day: Number(e.target.value) })}
                    className={`${inputClass} col-span-2 !px-3 sm:col-span-1`}
                  >
                    {WEEK.map((d) => (
                      <option key={d} value={d}>{dayName(d)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={slots.length === 1}
                    aria-label={t('Remove this time')}
                    onClick={() => setSlots((cur) => cur.filter((_, j) => j !== i))}
                    className="size-9 rounded-md text-muted hover:bg-bad-soft hover:text-bad disabled:invisible sm:order-last"
                  >
                    ×
                  </button>
                  <input type="time" required aria-label={t('Start time')} value={slot.startTime} onChange={(e) => setSlot(i, { startTime: e.target.value })} className={`${inputClass} !px-3`} />
                  <input type="time" required aria-label={t('End time')} value={slot.endTime} onChange={(e) => setSlot(i, { endTime: e.target.value })} className={`${inputClass} !px-3`} />
                </div>
              ))}
              <button type="button" onClick={addSlot} disabled={slots.length >= 14} className="text-sm font-medium text-accent">
                {t('+ Add another day or time')}
              </button>
              {clock && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 text-sm">
                  <span className="text-muted">{t('Quick fill')}:</span>
                  {([['Mon–Fri', [1, 2, 3, 4, 5]], ['Mon–Sat', [1, 2, 3, 4, 5, 6]], ['Every day', [1, 2, 3, 4, 5, 6, 0]]] as const).map(([label, days]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setSlots((cur) => days.map((day) => ({ day, startTime: cur[0].startTime, endTime: cur[0].endTime })))}
                      className="rounded-md bg-canvas px-2.5 py-1 font-medium hover:bg-accent-soft"
                    >
                      {t(label)}
                    </button>
                  ))}
                </div>
              )}
              {clock && slots.some((s) => s.endTime < s.startTime) && (
                <p className="text-xs text-muted">{t('The end time is earlier than the start, so this is a night shift that ends the next day.')}</p>
              )}
            </fieldset>
          ) : (
            <>
              <Field label={t('Date')} type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('Start time')} type="time" required value={startTime} onChange={(e) => setTimes({ startTime: e.target.value, endTime })} />
                <Field label={t('End time')} type="time" required value={endTime} onChange={(e) => setTimes({ startTime, endTime: e.target.value })} />
              </div>
            </>
          )}

          {weekly && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('Semester starts')} type="date" required value={semStart} max={semEnd} onChange={(e) => { setSemStart(e.target.value); setDatesTouched(true) }} />
              <Field label={t('Semester ends')} type="date" required value={semEnd} min={semStart} onChange={(e) => { setSemEnd(e.target.value); setDatesTouched(true) }} />
            </div>
          )}

          {weekly && clock && (
            <div className="space-y-3 rounded-lg bg-canvas p-4">
              <Field label={t('Office or branch')} hint={t('Optional')} placeholder={t('e.g. Main office')} maxLength={60} value={venue} onChange={(e) => setVenue(e.target.value)} />
              <div>
                <p className="mb-1.5 text-sm font-medium">{t('Where it is')}</p>
                <LocationPicker stored={editing} onChange={setFence} />
              </div>
            </div>
          )}

          {weekly && clock && (
            <fieldset className="space-y-3 rounded-lg bg-canvas p-4">
              <legend className="sr-only">{t('How this shift works')}</legend>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">{t('Counted late after')}</span>
                <select value={grace} onChange={(e) => setGrace(e.target.value)} className={inputClass}>
                  {[0, 5, 10, 15, 30].map((m) => (
                    <option key={m} value={m}>{m === 0 ? t('The start time, no grace') : t('{n} minutes', { n: m })}</option>
                  ))}
                  <option value="flex">{t('Never: flexible hours, only hours are counted')}</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">{t('Unpaid break')}</span>
                <select value={breakMin} onChange={(e) => setBreakMin(e.target.value)} className={inputClass}>
                  <option value="0">{t('None: every minute between in and out counts')}</option>
                  {[30, 45, 60, 90].map((m) => (
                    <option key={m} value={m}>{t('{n} minutes', { n: m })}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" checked={countEarly} onChange={(e) => setCountEarly(e.target.checked)} className="mt-0.5 size-4 accent-accent" />
                <span className="font-medium">{t('Count the time before the start when someone arrives early')}</span>
              </label>
              {has('shifts') && (myClasses ?? []).some((c) => c.id !== editing?.id && !c.rosterFrom) && (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">{t('Staff list')}</span>
                  <select
                    value={rosterFrom}
                    onChange={(e) => {
                      setRosterFrom(e.target.value)
                      if (e.target.value) setRotating(true)
                    }}
                    className={inputClass}
                  >
                    <option value="">{t('Its own list')}</option>
                    {(myClasses ?? [])
                      .filter((c) => c.id !== editing?.id && !c.rosterFrom)
                      .map((c) => (
                        <option key={c.id} value={c.id}>{t('Same list as {name}', { name: c.name })}</option>
                      ))}
                  </select>
                </label>
              )}
              {has('shifts') && <label className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" checked={rotating} onChange={(e) => setRotating(e.target.checked)} className="mt-0.5 size-4 accent-accent" />
                <span>
                  <span className="font-medium">{t('People rotate between shifts')}</span>
                  <span className="block text-xs text-muted">{t('Anyone on the list may clock in to whichever shift they are on. Tick this on every shift that shares the list.')}</span>
                </span>
              </label>}
              {has('shifts') && rotating && !rosterFrom && (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">{t('Each person works')}</span>
                  <select value={daysPerWeek} onChange={(e) => setDaysPerWeek(e.target.value)} className={inputClass}>
                    {[7, 6, 5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>{t('{n} days a week', { n })}</option>
                    ))}
                  </select>
                  <span className="mt-1.5 block text-xs text-muted">{t('Fewer days than this in a week, without leave or MC, counts as absent. No weekly schedule needed.')}</span>
                </label>
              )}
              {has('shifts') && (
                <Field
                  label={t('Fewest people needed')}
                  hint={t('Optional')}
                  type="number"
                  min={1}
                  max={10000}
                  inputMode="numeric"
                  value={minStaff}
                  onChange={(e) => setMinStaff(e.target.value)}
                />
              )}
            </fieldset>
          )}

          {!weekly && lists.length > 0 && (
            <label className="block">
              <span className="mb-1.5 flex justify-between text-sm font-medium">
                {t('Student list')} <span className="font-normal text-muted">{t('Optional')}</span>
              </span>
              <select value={rosterId} onChange={(e) => setRosterId(e.target.value)} className={inputClass}>
                <option value="">{t('None: anyone with the QR can check in')}</option>
                {lists.map((c) => (
                  <option key={c.id} value={c.id}>{`${c.name} (${t('{n} students', { n: c.rosterCount ?? 0 })})`}</option>
                ))}
              </select>
            </label>
          )}
          {editing && (
            <Link
              to={`/app/timetable/${editing.rosterFrom || editing.id}/students`}
              className="flex items-center justify-between rounded-lg bg-canvas px-4 py-3 text-sm hover:bg-accent-soft"
            >
              <span className="font-medium">{t('Student list')}</span>
              <span className="text-accent">{editing.rosterFrom ? `${t('Shared student list')} ›` : editing.rosterCount ? `${t('{n} students', { n: editing.rosterCount })} ›` : `${t('Upload')} ›`}</span>
            </Link>
          )}
          {editing && clock && profile.role === 'admin' && <HandOver cls={editing} onDone={() => navigate('/app/timetable')} />}
          {!hasList && (
            <Field
              label={t('Expected participants')}
              hint={t('Optional')}
              type="number"
              inputMode="numeric"
              min={1}
              placeholder={t('e.g. 42')}
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
            />
          )}

          {/* A workplace shift is always on site, and has no course details to fill in. */}
          {!clock && (
            <div>
              <p className="mb-1.5 text-sm font-medium">{t('How it is held')}</p>
              <div role="radiogroup" aria-label={t('How it is held')} className="grid grid-cols-3 gap-1 rounded-md bg-canvas p-1">
                {([['in_person', 'In person'], ['online', 'Online'], ['hybrid', 'Hybrid']] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={delivery === value}
                    onClick={() => setDelivery(value)}
                    className={`h-10 rounded-md text-sm font-semibold transition ${delivery === value ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}
                  >
                    {t(label)}
                  </button>
                ))}
              </div>
              {delivery !== 'in_person' && (
                <>
                  <p className="mt-2 text-xs text-muted">
                    {t('Students open the attendance link from the meeting chat and type the code you show on screen. The code changes every 45 seconds.')}
                  </p>
                  <Field
                    className="mt-3"
                    label={t('Meeting link')}
                    hint={t('Optional')}
                    type="url"
                    inputMode="url"
                    placeholder="https://zoom.us/j/…"
                    maxLength={300}
                    value={meetingUrl}
                    onChange={(e) => setMeetingUrl(e.target.value)}
                  />
                </>
              )}
            </div>
          )}

          {/* Everything a lecturer does not need to get started lives here. */}
          {!clock && (
            <details className="rounded-lg bg-canvas" open={Boolean(code || section || venue || description)}>
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium select-none">
                {t('More details')} <span className="font-normal text-muted">· {has('classKind') ? t('course code, section, venue') : t('venue, description')}</span>
              </summary>
              <div className="space-y-3 px-4 pb-4">
                <div className={has('classKind') ? 'grid grid-cols-2 gap-3' : 'hidden'}>
                  <Field label={t('Course code')} placeholder="SECJ3303" maxLength={20} value={code} onChange={(e) => setCode(e.target.value)} />
                  <Field label={t('Section')} placeholder="02" maxLength={10} value={section} onChange={(e) => setSection(e.target.value)} />
                </div>
                <Field label={t('Venue')} placeholder={t('e.g. Lecture Hall 2')} maxLength={60} value={venue} onChange={(e) => setVenue(e.target.value)} />
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">{t('Description')}</span>
                  <textarea rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputClass} h-auto py-3`} />
                </label>
              </div>
            </details>
          )}

          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" size="lg" block busy={busy}>
            {editing ? t('Save changes') : weekly ? t('Add to timetable') : t('Create session')}
          </Button>
          {editing && (
            <Button variant="ghost" block disabled={busy} className="!text-bad hover:!bg-bad-soft" onClick={remove}>
              {t('Remove from timetable')}
            </Button>
          )}
        </form>
      </Card>
    </div>
  )
}

/** An admin gives an office to the colleague who runs it; from then on only they (and admins) see it. */
function HandOver({ cls, onDone }: { cls: WeeklyClass; onDone: () => void }) {
  const profile = useProfile()
  const users = useLive<UserProfile[]>((onData, onError) => subscribeOrgUsers(profile.organisationId, onData, onError), [profile.organisationId])
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const others = (users.data ?? []).filter((u) => u.id !== cls.ownerId && u.status === 'active')
  if (others.length === 0) return null
  const give = async () => {
    const user = others.find((u) => u.id === to)
    if (!user || !window.confirm(t('Hand “{name}” over to {person}? It leaves your own pages; its past records stay with you.', { name: cls.name, person: user.name }))) return
    setBusy(true)
    setError('')
    try {
      await handOver(cls, user)
      onDone()
    } catch (e) {
      setError(friendlyError(e))
      setBusy(false)
    }
  }
  return (
    <div className="rounded-lg bg-canvas p-4">
      <p className="text-sm font-medium">{t('Who manages this office')}</p>
      <p className="mt-1 text-xs text-muted">{t('A branch manager sees only the office handed to them. Invite them from the Admin page first.')}</p>
      <div className="mt-3 flex gap-2">
        <select value={to} onChange={(e) => setTo(e.target.value)} className={inputClass}>
          <option value="">{cls.ownerId === profile.id ? t('Me ({name})', { name: cls.ownerName }) : t('{name} (now)', { name: cls.ownerName })}</option>
          {others.map((u) => (
            <option key={u.id} value={u.id}>{u.id === profile.id ? t('Me ({name})', { name: u.name }) : u.name}</option>
          ))}
        </select>
        <Button type="button" variant="secondary" busy={busy} disabled={!to} onClick={give}>{t('Hand over')}</Button>
      </div>
      <ErrorNote>{error}</ErrorNote>
    </div>
  )
}
