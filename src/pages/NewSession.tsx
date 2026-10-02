import { type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, Card, EmptyState, ErrorNote, Field, PageLoader, friendlyError, inputClass } from '../components/ui'
import { createClass, deleteClass, updateClass } from '../data/classes'
import { createSession } from '../data/sessions'
import { useProfile } from '../hooks/useAuth'
import { useMyClasses } from '../hooks/useClasses'
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
  const classes = useMyClasses()
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
  const [weekly, setWeekly] = useState(canRepeat && (Boolean(editing) || params.has('weekly')))
  const [name, setName] = useState(editing?.name ?? '')
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
    editing ? classSlots(editing) : [{ day: new Date().getDay(), ...defaultTimes() }],
  )
  const [expected, setExpected] = useState(editing?.expected ? String(editing.expected) : '')
  const [rosterId, setRosterId] = useState('')
  const myClasses = useMyClasses().data
  const lists = (myClasses ?? []).filter((c) => (c.rosterCount ?? 0) > 0)
  // Semester dates: default to 14 weeks from today, or to the dates of the newest class
  // already on the timetable, so a lecturer types them once per semester.
  const [semStart, setSemStart] = useState(editing?.startDate ?? isoDate())
  const [semEnd, setSemEnd] = useState(editing?.endDate ?? addDays(isoDate(), 14 * 7 - 1))
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
      if (slots.some((s) => s.endTime <= s.startTime)) return setError(t('Each end time needs to be after its start time.'))
      const seen = new Set(slots.map((s) => `${s.day}-${s.startTime}`))
      if (seen.size !== slots.length) return setError(t('Two of the times are the same. Remove one or change it.'))
      if (semEnd < semStart) return setError(t('The semester needs to end after it starts.'))
    } else if (endTime <= startTime) {
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
      if (editing) {
        await updateClass(editing.id, { ...details, kind, slots, startDate: semStart, endDate: semEnd })
        navigate('/app/timetable')
      } else if (weekly) {
        if (overLimit('classes', (myClasses?.length ?? 0) + 1)) {
          setBusy(false)
          return setError(t('The free plan includes 1 class. Upgrade to Pro to add more.'))
        }
        const id = await createClass(profile, { ...details, kind, slots, startDate: semStart, endDate: semEnd })
        navigate(`/app/timetable/${id}/students`)
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
            placeholder={t('e.g. Database Systems')}
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
              to={`/app/timetable/${editing.id}/students`}
              className="flex items-center justify-between rounded-lg bg-canvas px-4 py-3 text-sm hover:bg-accent-soft"
            >
              <span className="font-medium">{t('Student list')}</span>
              <span className="text-accent">{editing.rosterCount ? `${t('{n} students', { n: editing.rosterCount })} ›` : `${t('Upload')} ›`}</span>
            </Link>
          )}
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

          {/* Everything a lecturer does not need to get started lives here. */}
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
