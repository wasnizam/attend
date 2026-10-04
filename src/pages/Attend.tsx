import { type FormEvent, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { LanguageSwitch } from '../components/LanguageSwitch'
import { Button, Card, ErrorNote, Field, PageLoader, friendlyError } from '../components/ui'
import { type SubmitResult, clockOut, confirmPresence, getClockOut, submitAttendance } from '../data/attendance'
import { lookupStudent } from '../data/roster'
import { getSessionLink, subscribeSessionLink } from '../data/sessions'
import { formatClock, formatDuration, formatRange } from '../lib/format'
import { type Position, getPosition } from '../lib/geo'
import { t } from '../lib/i18n'
import { setPurpose } from '../lib/purpose'
import type { SessionLink } from '../lib/types'

const REMEMBER_KEY = 'attend.me'

function remembered(): { studentId: string; name: string } {
  try {
    return { studentId: '', name: '', ...JSON.parse(localStorage.getItem(REMEMBER_KEY) ?? '{}') }
  } catch {
    return { studentId: '', name: '' }
  }
}

function Shell({ children, below }: { children: React.ReactNode; below?: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <Card className="p-7">{children}</Card>
      {below}
      <div className="mt-6 flex flex-col items-center gap-3">
        <LanguageSwitch className="!bg-white" />
        <p className="text-center text-xs text-muted">Attend · {t('Attendance, without the hassle')}</p>
      </div>
    </div>
  )
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <Shell>
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-muted">{text}</p>
      </div>
    </Shell>
  )
}

/**
 * Shown under the confirmation once a student is on record. It follows the session live:
 * when the lecturer opens a "still here?" check, a button appears here straight away.
 */
function PresencePrompt({ token, studentId }: { token: string; studentId: string }) {
  const [link, setLink] = useState<SessionLink | null>(null)
  const [now, setNow] = useState(Date.now())
  const [confirmed, setConfirmed] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => subscribeSessionLink(token, setLink), [token])
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const cp = link?.status === 'active' ? link.checkpoint : null
  if (!link || !cp) return null
  const left = Math.ceil((cp.expiresAt.toMillis() - now) / 1000)
  const done = confirmed === cp.n

  if (done) {
    return (
      <Card className="mt-4 p-5 text-center">
        <p className="font-semibold text-good">✓ {t('Presence confirmed')}</p>
        <p className="mt-1 text-sm text-muted">{t('Keep this page open in case your lecturer checks again.')}</p>
      </Card>
    )
  }
  if (left <= 0) return null

  const confirm = async () => {
    setBusy(true)
    setError('')
    try {
      await confirmPresence(link, studentId)
      setConfirmed(cp.n)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mt-4 p-5 text-center ring-2 ring-accent">
      <p className="text-lg font-semibold tracking-tight">{t('Are you still here?')}</p>
      <p className="mt-1 text-sm text-muted">
        {t('Your lecturer is checking who is still present.')}{' '}
        <span className="tabular">
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
        </span>
      </p>
      <div className="mt-4 space-y-3">
        <ErrorNote>{error}</ErrorNote>
        <Button size="lg" block busy={busy} onClick={confirm}>
          {t('I’m still here')}
        </Button>
      </div>
    </Card>
  )
}

/**
 * Workplace: shown once someone is clocked in. Scanning again at the end of the day
 * brings them here, where one tap clocks them out.
 */
function ClockOutCard({ link, studentId, since, justIn, code }: { link: SessionLink; studentId: string; since: Date | null; justIn?: boolean; code?: string }) {
  const [out, setOut] = useState<Date | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getClockOut(link, studentId).then(setOut, () => setOut(null))
  }, [link, studentId])

  if (out === undefined) return null
  if (out) {
    return (
      <Card className="mt-4 p-5 text-center">
        <p className="font-semibold text-good">✓ {t('Clocked out at {time}', { time: formatClock(out) })}</p>
        {since && <p className="tabular mt-1 text-sm text-muted">{t('Time at work: {d}', { d: formatDuration((out.getTime() - since.getTime()) / 60_000) })}</p>}
        {/* Clocked out by mistake, or came back: after a fresh scan the time can be moved to now. */}
        {link.status === 'active' && !justIn && Date.now() - out.getTime() > 60_000 && (
          <div className="mt-4 space-y-2 border-t border-line pt-4">
            <p className="text-sm text-muted">{t('Still at work? Clock out again when you really leave.')}</p>
            <ErrorNote>{error}</ErrorNote>
            <Button
              variant="secondary"
              block
              busy={busy}
              onClick={async () => {
                setBusy(true)
                setError('')
                try {
                  setOut(await clockOut(link, studentId, code, true))
                } catch {
                  setError(t('We could not clock you out. The code may have changed: scan the QR again.'))
                } finally {
                  setBusy(false)
                }
              }}
            >
              {t('I am leaving now')}
            </Button>
          </div>
        )}
      </Card>
    )
  }
  if (link.status !== 'active') return null
  // Straight after clocking in, a button would only invite a slip of the thumb.
  if (justIn) return <p className="mt-4 text-center text-sm text-muted">{t('When you leave, scan the QR again to clock out.')}</p>
  return (
    <Card className="mt-4 p-5 text-center">
      <p className="font-semibold tracking-tight">{t('Leaving now?')}</p>
      <p className="mt-1 text-sm text-muted">{t('Tap the button to record the time you leave.')}</p>
      <div className="mt-4 space-y-3">
        <ErrorNote>{error}</ErrorNote>
        <Button
          size="lg"
          variant="secondary"
          block
          busy={busy}
          onClick={async () => {
            setBusy(true)
            setError('')
            try {
              setOut(await clockOut(link, studentId, code))
            } catch {
              setError(t('We could not clock you out. The code may have changed: scan the QR again.'))
            } finally {
              setBusy(false)
            }
          }}
        >
          {t('Clock out')}
        </Button>
      </div>
    </Card>
  )
}

/** What a participant sees after scanning the QR or opening the link. No account, no install. */
export default function Attend() {
  const { token = '' } = useParams()
  const [params] = useSearchParams()
  const scannedCode = params.get('c') ?? undefined
  const [link, setLink] = useState<SessionLink | null | undefined>(undefined)
  const [loadError, setLoadError] = useState(false)
  const [{ studentId, name }, setForm] = useState(remembered)
  const [typedCode, setTypedCode] = useState('')
  const [usedCode, setUsedCode] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<SubmitResult | null>(null)

  useEffect(() => {
    setLink(undefined)
    setLoadError(false)
    getSessionLink(token).then(
      (found) => {
        // The session says what kind of organisation runs it, which picks the wording here.
        setPurpose(found?.purpose)
        setLink(found)
      },
      () => setLoadError(true),
    )
  }, [token])

  useEffect(() => {
    if (link) document.title = `${link.name} · ${t('Attendance')}`
  }, [link])

  if (loadError) return <Message title={t('No connection')} text={t('Check your internet connection and scan the QR again.')} />
  if (link === undefined) return <PageLoader />
  if (link === null) {
    return <Message title={t('QR not recognised')} text={t('This attendance link is not valid. Please scan the QR shown by your lecturer.')} />
  }

  const workplace = link.purpose === 'workplace'

  if (result?.kind === 'recorded') {
    return (
      <Shell
        below={
          <>
            {workplace && <ClockOutCard link={link} studentId={studentId} since={result.time} justIn />}
            <PresencePrompt token={link.token} studentId={studentId} />
          </>
        }
      >
        <div className="text-center">
          <div className="animate-pop mx-auto flex size-20 items-center justify-center rounded-full bg-good text-4xl text-white">✓</div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">{t('Attendance Confirmed')}</h1>
          <p className="mt-4 text-lg font-medium">{link.name}</p>
          <p className="tabular text-3xl font-semibold tracking-tight">{formatClock(result.time)}</p>
          <p className="mt-4 text-muted">{t('Your attendance has been recorded.')}</p>
          <p className="mt-1 text-sm text-muted">{result.studentName}</p>
        </div>
      </Shell>
    )
  }

  if (result?.kind === 'duplicate') {
    return (
      <Shell
        below={
          <>
            {workplace && <ClockOutCard link={link} studentId={studentId} since={result.time} code={usedCode} />}
            <PresencePrompt token={link.token} studentId={studentId} />
          </>
        }
      >
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{workplace ? t('You are clocked in') : t('Already Recorded')}</h1>
          <p className="mt-2 text-muted">{workplace ? t('To leave, use the Clock out button below.') : t('Your attendance for this session has already been recorded.')}</p>
          <dl className="mt-6 space-y-2 rounded-lg bg-canvas p-4 text-left text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{t('Session')}</dt>
              <dd className="text-right font-medium">{link.name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{t('Name')}</dt>
              <dd className="text-right font-medium">{result.studentName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{t('Time recorded')}</dt>
              <dd className="tabular font-medium">{formatClock(result.time)}</dd>
            </div>
          </dl>
        </div>
      </Shell>
    )
  }

  if (result?.kind === 'stale') {
    return (
      <Message
        title={t('Scan the QR again')}
        text={t('That QR code has expired. Point your camera at the QR on the screen again and submit straight away.')}
      />
    )
  }

  if (result?.kind === 'closed' || link.status !== 'active' || link.expiresAt.toMillis() <= Date.now()) {
    return <Message title={t('Attendance closed')} text={t('Attendance for {name} is no longer open.', { name: link.name })} />
  }

  const listed = Boolean(link.rosterId)
  // Opened from a link (a meeting chat) rather than a scan: the code is typed instead.
  const asksCode = Boolean(link.needsCode) && !scannedCode

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!studentId.trim() || (!listed && !name.trim()) || (asksCode && !typedCode.trim())) return
    setBusy(true)
    setError('')
    try {
      // With a class list, the name comes from the list, not from the student.
      const listedName = listed ? await lookupStudent(link.rosterId!, studentId) : name
      if (!listedName) {
        setError(t('That ID is not on the class list. Check it and try again, or speak to your lecturer.'))
        return
      }
      // Location check: ask the phone where it is. In "warn only" mode a refusal is
      // fine (the lecturer just sees a note); in "refuse check-in" mode it is required.
      let position: Position | undefined
      if (link.geo) {
        try {
          position = await getPosition()
        } catch (geoError) {
          if (link.geo === 'block') {
            setError(`${(geoError as Error).message} ${t('If you are in the class and this keeps happening, see your lecturer.')}`)
            return
          }
        }
      }
      const code = scannedCode ?? (asksCode ? typedCode.trim().toUpperCase() : undefined)
      setUsedCode(code)
      const outcome = await submitAttendance(link, studentId, listedName, code, position)
      if (outcome.kind === 'stale' && link.phoneCheck === 'block' && !asksCode) {
        setError(t('This phone is not registered to you. Clock in with your own phone, or ask your manager to approve this one.'))
        return
      }
      if (outcome.kind === 'stale' && link.geo === 'block') {
        // Refused while the session is open: too far away, or an old code.
        setTypedCode('')
        setError(t('We could not check you in. You may be too far from the class, or the code has changed. Try again from inside the room, or see your lecturer.'))
        return
      }
      if (outcome.kind === 'stale' && asksCode) {
        // A mistyped or just-expired code: let them try again without losing the form.
        setTypedCode('')
        setError(t('That code is not right, or it has just changed. Type the code that is on the screen now.'))
        return
      }
      if (outcome.kind === 'recorded') {
        // Remembered on this phone only, to pre-fill the next session's form.
        try {
          localStorage.setItem(REMEMBER_KEY, JSON.stringify({ studentId: studentId.trim(), name: listedName.trim() }))
        } catch {
          // Private browsing: nothing to remember, nothing to do.
        }
      }
      setResult(outcome)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell>
      <h1 className="text-2xl font-semibold tracking-tight">{link.name}</h1>
      <p className="mt-0.5 text-muted">
        {t('Attendance')} · {formatRange(link)}
        {link.venue ? ` · ${link.venue}` : ''}
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <p className="text-sm font-medium">{listed ? t('Enter your student ID:') : t('Enter your details:')}</p>
        <Field
          label={t('Student ID')}
          required
          maxLength={40}
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          value={studentId}
          onChange={(e) => setForm({ studentId: e.target.value, name })}
        />
        {!listed && (
          <Field
            label={t('Name')}
            required
            maxLength={80}
            autoComplete="name"
            value={name}
            onChange={(e) => setForm({ studentId, name: e.target.value })}
          />
        )}
        {asksCode && (
          <Field
            label={t('Code on the screen')}
            hint={t('It changes every 45 seconds')}
            required
            maxLength={8}
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            className="[&_input]:font-mono [&_input]:tracking-[0.3em] [&_input]:uppercase"
            value={typedCode}
            onChange={(e) => setTypedCode(e.target.value)}
          />
        )}
        {link.geo && (
          <p className="rounded-lg bg-canvas px-3 py-2 text-xs text-muted">
            {t('This session checks that you are in the class. Your phone will ask to share your location when you confirm. Only your lecturer can see it.')}
          </p>
        )}
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" size="lg" block busy={busy}>
          {t('Confirm Attendance')}
        </Button>
      </form>
    </Shell>
  )
}
