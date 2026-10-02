import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { type Fence, LocationPicker } from '../components/LocationPicker'
import { ListUploader } from '../components/ListUploader'
import { Button, Card, ErrorNote, Field, Logo, PageLoader, friendlyError, inputClass } from '../components/ui'
import { getOrganisation, renameOrganisation, setShifts } from '../data/account'
import { type ClassInput, createClass, setClassGeofence, updateClass } from '../data/classes'
import { useProfile } from '../hooks/useAuth'
import { useMyClasses } from '../hooks/useClasses'
import { useRoster } from '../hooks/useRoster'
import { WEEK, addDays, classSlots, dayName, isoDate } from '../lib/format'
import { t } from '../lib/i18n'
import { has } from '../lib/purpose'
import { DEFAULT_RADIUS, RADII } from '../lib/geo'
import type { GeoMode, Organisation, WeeklyClass } from '../lib/types'

const STEP_KEY = 'attend.setup.step'
const STEPS = ['Your company', 'Your people', 'Working rules', 'Clocking in']
/** Working hours do not run out the way a semester does. */
const FAR = 3 * 365

const readStep = () => {
  try {
    return Math.min(3, Math.max(0, Number(localStorage.getItem(STEP_KEY) ?? 0) || 0))
  } catch {
    return 0
  }
}

const inputOf = (cls: WeeklyClass | undefined, patch: Partial<ClassInput>): ClassInput => ({
  name: cls?.name ?? t('Main office'),
  description: cls?.description ?? '',
  slots: cls ? classSlots(cls) : [1, 2, 3, 4, 5].map((day) => ({ day, startTime: '09:00', endTime: '17:00' })),
  startDate: cls?.startDate ?? isoDate(),
  endDate: cls?.endDate ?? addDays(isoDate(), FAR),
  expected: cls?.expected ?? null,
  code: '',
  section: '',
  // For a workplace the venue is the office (or branch) these hours belong to.
  venue: cls?.venue ?? '',
  delivery: 'in_person',
  meetingUrl: '',
  kind: 'lecture',
  graceMin: cls?.graceMin ?? 10,
  flexible: cls?.flexible,
  rotating: cls?.rotating,
  rosterFrom: cls?.rosterFrom,
  daysPerWeek: cls?.daysPerWeek,
  minStaff: cls?.minStaff,
  breakMin: cls?.breakMin ?? 60,
  countEarly: cls?.countEarly,
  ...patch,
})

/**
 * The first thing a new workplace sees: four short steps that set up everything attendance
 * depends on. Company, people, working rules, how people clock in. Each step saves as it goes,
 * so leaving half-way loses nothing.
 */
export function Setup() {
  const profile = useProfile()
  const navigate = useNavigate()
  const classes = useMyClasses()
  const [step, setStepState] = useState(readStep)
  const [org, setOrg] = useState<Organisation | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getOrganisation(profile.organisationId).then(setOrg, () => {})
  }, [profile.organisationId])

  const setStep = (n: number) => {
    try {
      localStorage.setItem(STEP_KEY, String(n))
    } catch {
      // Not remembered; they simply start from the first step next time.
    }
    setError('')
    setStepState(n)
  }
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

  if (!has('clock')) return <Navigate to="/app" replace />
  if (classes.loading || !org) return <PageLoader />
  // Each office has its own working hours and its own staff list. They are made at the end of
  // step one, with the usual office defaults.
  const offices = (classes.data ?? []).filter((c) => !c.rosterFrom).sort((a, b) => (a.createdAt?.toMillis() ?? Infinity) - (b.createdAt?.toMillis() ?? Infinity))
  const hours = offices[0]

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="mx-auto max-w-xl px-5 py-8">
        <div className="flex items-center justify-between">
          <Logo />
          <Link to="/app" className="text-sm font-medium text-muted hover:text-ink">{t('Finish later')}</Link>
        </div>
        <ol className="mt-8 grid grid-cols-4 gap-2">
          {STEPS.map((label, i) => (
            <li key={label}>
              <span className={`block h-1.5 rounded-full ${i <= step ? 'bg-accent' : 'bg-slate-200'}`} />
              <span className={`mt-2 block text-xs font-medium ${i === step ? 'text-ink' : 'text-muted'}`}>
                {i + 1}. {t(label)}
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-6 space-y-4">
          <ErrorNote>{error}</ErrorNote>
          {step === 0 && (
            <Company
              org={org}
              offices={offices}
              busy={busy}
              onNext={(name, rows) =>
                run(async () => {
                  if (name.trim() && name.trim() !== org.name) {
                    await renameOrganisation(org, name)
                    setOrg({ ...org, name: name.trim() })
                  }
                  for (const row of rows) {
                    const label = row.name.trim() || t('Main office')
                    const existing = offices.find((c) => c.id === row.id)
                    const id = existing?.id ?? (await createClass(profile, inputOf(hours, { name: label, venue: label })))
                    if (existing && existing.name !== label) await updateClass(id, inputOf(existing, { name: label, venue: label }))
                    if (row.fence !== undefined) await setClassGeofence(id, row.fence)
                  }
                  setStep(1)
                })
              }
            />
          )}
          {step === 1 && hours && <People offices={offices} onBack={() => setStep(0)} onNext={() => setStep(2)} />}
          {step === 2 && hours && (
            <Rules
              hours={hours}
              many={offices.length > 1}
              shifts={Boolean(org.shifts)}
              busy={busy}
              onBack={() => setStep(1)}
              onNext={(patch, shifts) =>
                run(async () => {
                  // The same rules for every office; one office can be changed later.
                  for (const office of offices) await updateClass(office.id, inputOf(office, patch))
                  if (shifts !== Boolean(org.shifts) && profile.role === 'admin') {
                    await setShifts(org.id, shifts)
                    setOrg({ ...org, shifts })
                  }
                  setStep(3)
                })
              }
            />
          )}
          {step === 3 && (
            <Card className="space-y-5 p-6">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">{t('How will people clock in?')}</h1>
                <p className="mt-1 text-sm text-muted">{t('Everything is set. One last choice.')}</p>
              </div>
              <div className="rounded-xl p-4 ring-2 ring-accent">
                <p className="font-semibold">{t('A screen at the door')}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {t('Leave a tablet or computer at the entrance showing the QR. People scan it with their own phone when they arrive and when they leave. It opens and closes by itself every working day.')}
                </p>
              </div>
              <div className="rounded-xl bg-white p-4 opacity-70 shadow-card">
                <p className="font-semibold">
                  {t('Their own phone, no screen')} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-muted">{t('Not available yet')}</span>
                </p>
                <p className="mt-1 text-sm text-slate-600">{t('People clock in from their phone when they are at the workplace, checked by location.')}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setStep(2)}>{t('Back')}</Button>
                <Button block onClick={() => { setStep(0); navigate('/app/door') }}>{t('Open door screen')}</Button>
              </div>
              <button onClick={() => { setStep(0); navigate('/app') }} className="w-full text-center text-sm font-medium text-accent">
                {t('Not now, take me to Today')}
              </button>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

interface OfficeRow {
  /** Set once the office is saved. */
  id?: string
  name: string
  fence: Fence
}

function Company({ org, offices, busy, onNext }: { org: Organisation; offices: WeeklyClass[]; busy: boolean; onNext: (name: string, rows: OfficeRow[]) => void }) {
  const [name, setName] = useState(org.name)
  const [rows, setRows] = useState<OfficeRow[]>(() =>
    offices.length ? offices.map((c) => ({ id: c.id, name: c.venue || c.name, fence: undefined })) : [{ name: t('Main office'), fence: undefined }],
  )
  // One distance and one rule for every office: simpler to set, and to explain to staff.
  const [radius, setRadius] = useState(offices.find((c) => c.geoPoint)?.geoRadius ?? DEFAULT_RADIUS)
  const [mode, setMode] = useState<GeoMode>(offices.find((c) => c.geoPoint)?.geoMode ?? 'flag')
  const located = rows.some((r) => r.fence || (r.fence === undefined && offices.find((c) => c.id === r.id)?.geoPoint))
  const finish = () =>
    onNext(
      name,
      rows.map((r) => {
        const kept = offices.find((c) => c.id === r.id)?.geoPoint
        const point = r.fence ? r.fence : r.fence === undefined && kept ? { lat: kept.latitude, lng: kept.longitude } : null
        return { ...r, fence: point ? { lat: point.lat, lng: point.lng, radius, mode } : r.fence }
      }),
    )
  const patch = (i: number, change: Partial<OfficeRow>) => setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...change } : r)))

  return (
    <Card className="space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t('Your company')}</h1>
        <p className="mt-1 text-sm text-muted">{t('Four short steps and attendance runs by itself. You can change everything later.')}</p>
      </div>
      <Field label={t('Company name')} required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
      <div>
        <p className="text-sm font-medium">{t('Your offices')}</p>
        <p className="mt-1 text-xs text-muted">{t('One office or several branches. Set each location while you are standing in it; you can also do that later. A clock-in from somewhere else is then flagged, or refused.')}</p>
        <div className="mt-3 space-y-3">
          {rows.map((row, i) => (
            <div key={row.id ?? `new-${i}`} className="space-y-3 rounded-lg bg-canvas p-4">
              <div className="flex items-end gap-2">
                <Field className="flex-1" label={rows.length > 1 ? t('Office {n}', { n: i + 1 }) : t('Office name')} maxLength={60} value={row.name} onChange={(e) => patch(i, { name: e.target.value })} />
                {!row.id && rows.length > 1 && (
                  <button type="button" aria-label={t('Remove')} onClick={() => setRows((cur) => cur.filter((_, j) => j !== i))} className="size-12 rounded-md text-muted hover:bg-bad-soft hover:text-bad">×</button>
                )}
              </div>
              <LocationPicker pointOnly stored={offices.find((c) => c.id === row.id)} onChange={(fence) => patch(i, { fence })} />
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setRows((cur) => [...cur, { name: '', fence: undefined }])} disabled={rows.length >= 20} className="mt-3 text-sm font-medium text-accent">
          {t('+ Add another office')}
        </button>
        {located && (
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
            <label className="block text-xs font-medium text-muted">
              {t('How far still counts')}
              <select value={radius} onChange={(e) => setRadius(Number(e.target.value))} className={`${inputClass} mt-1`}>
                {RADII.map((r) => (
                  <option key={r} value={r}>{r} m</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-muted">
              {t('From further away')}
              <select value={mode} onChange={(e) => setMode(e.target.value as GeoMode)} className={`${inputClass} mt-1`}>
                <option value="flag">{t('Flag it for me')}</option>
                <option value="block">{t('Refuse check-in')}</option>
              </select>
            </label>
            {rows.length > 1 && <p className="col-span-2 text-xs text-muted">{t('The same for every office. One office can be set differently later, under Working hours.')}</p>}
          </div>
        )}
      </div>
      <Button block size="lg" busy={busy} disabled={!name.trim() || rows.some((r) => !r.name.trim())} onClick={finish}>{t('Continue')}</Button>
    </Card>
  )
}

function People({ offices, onBack, onNext }: { offices: WeeklyClass[]; onBack: () => void; onNext: () => void }) {
  const [officeId, setOfficeId] = useState(offices[0].id)
  const office = offices.find((c) => c.id === officeId) ?? offices[0]
  const roster = useRoster(office.id, office.organisationId)
  const people = roster.data ?? []
  return (
    <>
      <Card className="p-6">
        <h1 className="text-xl font-semibold tracking-tight">{t('Your people')}</h1>
        <p className="mt-1 text-sm text-muted">
          {t('Upload your staff list: an ID, a name, and a department if you have one. People then type only their ID to clock in.')}
        </p>
        {offices.length > 1 && (
          <label className="mt-4 block text-xs font-medium text-muted">
            {t('Which office are these people in?')}
            <select value={office.id} onChange={(e) => setOfficeId(e.target.value)} className={`${inputClass} mt-1`}>
              {offices.map((c) => (
                <option key={c.id} value={c.id}>{`${c.venue || c.name}${c.rosterCount ? ` · ${c.rosterCount}` : ''}`}</option>
              ))}
            </select>
          </label>
        )}
        {people.length > 0 && (
          <p className="mt-4 rounded-lg bg-good-soft px-4 py-3 text-sm text-good">
            ✓ {t('{n} people on the list', { n: people.length })}: {people.slice(0, 3).map((p) => p.studentName).join(', ')}
            {people.length > 3 ? '…' : ''}{' '}
            <Link to={`/app/timetable/${office.id}/students`} className="font-semibold underline">{t('Edit list')}</Link>
          </p>
        )}
      </Card>
      <ListUploader key={office.id} cls={office} current={people} />
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onBack}>{t('Back')}</Button>
        <Button block size="lg" onClick={onNext}>{offices.some((c) => c.rosterCount) || people.length > 0 ? t('Continue') : t('Skip for now')}</Button>
      </div>
    </>
  )
}

function Rules({ hours, many, shifts, busy, onBack, onNext }: { hours: WeeklyClass; many: boolean; shifts: boolean; busy: boolean; onBack: () => void; onNext: (patch: Partial<ClassInput>, shifts: boolean) => void }) {
  const first = classSlots(hours)[0]
  const [days, setDays] = useState<number[]>(() => [...new Set(classSlots(hours).map((s) => s.day))])
  const [start, setStart] = useState(first.startTime)
  const [end, setEnd] = useState(first.endTime)
  const [grace, setGrace] = useState(hours.flexible ? 'flex' : String(hours.graceMin ?? 10))
  const [useShifts, setUseShifts] = useState(shifts)
  const [breakMin, setBreakMin] = useState(String(hours.breakMin ?? 60))
  const [countEarly, setCountEarly] = useState(Boolean(hours.countEarly))
  const valid = days.length > 0 && start !== end

  return (
    <Card className="space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t('Working rules')}</h1>
        <p className="mt-1 text-sm text-muted">{t('The days and hours people work. Lateness, hours and overtime are worked out from these.')}</p>
        {many && <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-xs text-slate-600">{t('These rules are set for every office. An office with different hours can be changed afterwards under Working hours.', undefined, true)}</p>}
      </div>
      <div>
        <p className="mb-1.5 text-sm font-medium">{t('Working days')}</p>
        <div className="flex flex-wrap gap-1.5">
          {WEEK.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={days.includes(d)}
              onClick={() => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))}
              className={`h-10 rounded-lg px-3 text-sm font-semibold transition ${days.includes(d) ? 'bg-accent text-white' : 'bg-canvas text-muted'}`}
            >
              {dayName(d).slice(0, 3)}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('Start time')} type="time" required value={start} onChange={(e) => setStart(e.target.value)} />
        <Field label={t('End time')} type="time" required value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>
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
        <span className="mt-1.5 block text-xs text-muted">{t('Taken off the hours of any day longer than five hours. Nobody has to clock out for lunch.')}</span>
      </label>
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" checked={countEarly} onChange={(e) => setCountEarly(e.target.checked)} className="mt-0.5 size-4 accent-accent" />
        <span>
          <span className="font-medium">{t('Count the time before the start when someone arrives early')}</span>
          <span className="block text-xs text-muted">{t('Left off, hours begin at the start time even if someone clocks in earlier.')}</span>
        </span>
      </label>
      <p className="rounded-lg bg-canvas px-4 py-3 text-sm text-slate-600">{t('Overtime is counted by itself: any time worked after the end time.')}</p>
      <div>
        <p className="mb-1.5 text-sm font-medium">{t('Does your company work in shifts?', undefined, true)}</p>
        <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-md bg-canvas p-1">
          {([[false, 'No, the same hours for everyone'], [true, 'Yes, we have shifts']] as const).map(([value, label]) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={useShifts === value}
              onClick={() => setUseShifts(value)}
              className={`min-h-10 rounded-md px-2 py-1.5 text-sm font-semibold transition ${useShifts === value ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}
            >
              {t(label, undefined, true)}
            </button>
          ))}
        </div>
        {useShifts && <p className="mt-2 text-xs text-muted">{t('These hours become your first shift. You add the other shifts and the weekly plan afterwards.', undefined, true)}</p>}
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onBack}>{t('Back')}</Button>
        <Button
          block
          size="lg"
          busy={busy}
          disabled={!valid}
          onClick={() =>
            onNext(
              {
                slots: WEEK.filter((d) => days.includes(d)).map((day) => ({ day, startTime: start, endTime: end })),
                graceMin: grace === 'flex' ? null : Number(grace),
                flexible: grace === 'flex',
                breakMin: Number(breakMin),
                countEarly,
              },
              useShifts,
            )
          }
        >
          {t('Continue')}
        </Button>
      </div>
    </Card>
  )
}
