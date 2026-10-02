import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ListUploader } from '../components/ListUploader'
import { Button, Card, ErrorNote, Field, Logo, PageLoader, friendlyError, inputClass } from '../components/ui'
import { getOrganisation, renameOrganisation, setShifts } from '../data/account'
import { type ClassInput, createClass, setClassGeofence, updateClass } from '../data/classes'
import { useProfile } from '../hooks/useAuth'
import { useMyClasses } from '../hooks/useClasses'
import { useRoster } from '../hooks/useRoster'
import { WEEK, addDays, classSlots, dayName, isoDate } from '../lib/format'
import { DEFAULT_RADIUS, RADII, getPosition } from '../lib/geo'
import { t } from '../lib/i18n'
import { has } from '../lib/purpose'
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
  name: cls?.name ?? t('Office hours'),
  description: cls?.description ?? '',
  slots: cls ? classSlots(cls) : [1, 2, 3, 4, 5].map((day) => ({ day, startTime: '09:00', endTime: '17:00' })),
  startDate: cls?.startDate ?? isoDate(),
  endDate: cls?.endDate ?? addDays(isoDate(), FAR),
  expected: cls?.expected ?? null,
  code: '',
  section: '',
  venue: '',
  delivery: 'in_person',
  meetingUrl: '',
  kind: 'lecture',
  graceMin: cls?.graceMin ?? 10,
  flexible: cls?.flexible,
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
  // The working hours everything hangs on: made at the end of step one, with office defaults.
  const hours = (classes.data ?? []).find((c) => !c.rosterFrom)

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
              hours={hours}
              busy={busy}
              onNext={(name, fence) =>
                run(async () => {
                  if (name.trim() && name.trim() !== org.name) {
                    await renameOrganisation(org, name)
                    setOrg({ ...org, name: name.trim() })
                  }
                  const id = hours?.id ?? (await createClass(profile, inputOf(undefined, {})))
                  if (fence !== undefined) await setClassGeofence(id, fence)
                  setStep(1)
                })
              }
            />
          )}
          {step === 1 && hours && <People hours={hours} onBack={() => setStep(0)} onNext={() => setStep(2)} />}
          {step === 2 && hours && (
            <Rules
              hours={hours}
              shifts={Boolean(org.shifts)}
              busy={busy}
              onBack={() => setStep(1)}
              onNext={(patch, shifts) =>
                run(async () => {
                  await updateClass(hours.id, inputOf(hours, patch))
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

type Fence = { lat: number; lng: number; radius: number; mode: GeoMode } | null

function Company({ org, hours, busy, onNext }: { org: Organisation; hours?: WeeklyClass; busy: boolean; onNext: (name: string, fence: Fence | undefined) => void }) {
  const [name, setName] = useState(org.name)
  // undefined = leave the location as it is; null = no location check.
  const [fence, setFence] = useState<Fence | undefined>(undefined)
  const [radius, setRadius] = useState(hours?.geoRadius ?? DEFAULT_RADIUS)
  const [mode, setMode] = useState<GeoMode>(hours?.geoMode ?? 'flag')
  const [finding, setFinding] = useState(false)
  const [geoError, setGeoError] = useState('')
  const located = fence ? true : fence === undefined && Boolean(hours?.geoPoint)

  const locate = async () => {
    setFinding(true)
    setGeoError('')
    try {
      const here = await getPosition()
      setFence({ lat: here.lat, lng: here.lng, radius, mode })
    } catch (e) {
      setGeoError((e as Error).message)
    } finally {
      setFinding(false)
    }
  }
  const next = () =>
    onNext(
      name,
      fence ? { ...fence, radius, mode } : fence === undefined && hours?.geoPoint ? { lat: hours.geoPoint.latitude, lng: hours.geoPoint.longitude, radius, mode } : fence,
    )

  return (
    <Card className="space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t('Your company')}</h1>
        <p className="mt-1 text-sm text-muted">{t('Four short steps and attendance runs by itself. You can change everything later.')}</p>
      </div>
      <Field label={t('Company name')} required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
      <div>
        <p className="text-sm font-medium">{t('Where is the workplace?')} <span className="font-normal text-muted">· {t('Optional')}</span></p>
        <p className="mt-1 text-xs text-muted">{t('Do this while you are at the workplace. A clock-in from somewhere else is then flagged, or refused.')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" busy={finding} onClick={locate}>{located ? t('Update to where I am now') : t('Use where I am now')}</Button>
          {located && <span className="text-sm font-medium text-good">✓ {t('Location saved')}</span>}
          {located && <button onClick={() => setFence(null)} className="text-sm font-medium text-muted hover:text-bad">{t('Remove')}</button>}
        </div>
        {geoError && <p className="mt-2 text-sm text-bad">{geoError}</p>}
        {located && (
          <div className="mt-3 grid grid-cols-2 gap-3">
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
          </div>
        )}
      </div>
      <Button block size="lg" busy={busy} disabled={!name.trim()} onClick={next}>{t('Continue')}</Button>
    </Card>
  )
}

function People({ hours, onBack, onNext }: { hours: WeeklyClass; onBack: () => void; onNext: () => void }) {
  const roster = useRoster(hours.id, hours.organisationId)
  const people = roster.data ?? []
  return (
    <>
      <Card className="p-6">
        <h1 className="text-xl font-semibold tracking-tight">{t('Your people')}</h1>
        <p className="mt-1 text-sm text-muted">
          {t('Upload your staff list: an ID, a name, and a department if you have one. People then type only their ID to clock in.')}
        </p>
        {people.length > 0 && (
          <p className="mt-4 rounded-lg bg-good-soft px-4 py-3 text-sm text-good">
            ✓ {t('{n} people on the list', { n: people.length })}: {people.slice(0, 3).map((p) => p.studentName).join(', ')}
            {people.length > 3 ? '…' : ''}{' '}
            <Link to={`/app/timetable/${hours.id}/students`} className="font-semibold underline">{t('Edit list')}</Link>
          </p>
        )}
      </Card>
      <ListUploader cls={hours} current={people} />
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onBack}>{t('Back')}</Button>
        <Button block size="lg" onClick={onNext}>{people.length > 0 ? t('Continue') : t('Skip for now')}</Button>
      </div>
    </>
  )
}

function Rules({ hours, shifts, busy, onBack, onNext }: { hours: WeeklyClass; shifts: boolean; busy: boolean; onBack: () => void; onNext: (patch: Partial<ClassInput>, shifts: boolean) => void }) {
  const first = classSlots(hours)[0]
  const [days, setDays] = useState<number[]>(() => [...new Set(classSlots(hours).map((s) => s.day))])
  const [start, setStart] = useState(first.startTime)
  const [end, setEnd] = useState(first.endTime)
  const [grace, setGrace] = useState(hours.flexible ? 'flex' : String(hours.graceMin ?? 10))
  const [useShifts, setUseShifts] = useState(shifts)
  const valid = days.length > 0 && start !== end

  return (
    <Card className="space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t('Working rules')}</h1>
        <p className="mt-1 text-sm text-muted">{t('The days and hours people work. Lateness, hours and overtime are worked out from these.')}</p>
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
