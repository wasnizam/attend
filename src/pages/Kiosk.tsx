import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Logo, PageLoader } from '../components/ui'
import { startClassSession } from '../data/classes'
import { signOut } from '../data/account'
import { endSession, rotateCode, startSession } from '../data/sessions'
import { useProfile } from '../hooks/useAuth'
import { useMyClasses } from '../hooks/useClasses'
import { useMySessions, useNow, useSessionAttendance } from '../hooks/useSessions'
import { type AgendaItem, agendaFor } from '../lib/agenda'
import { attendUrl, countPresent, formatClock, formatRange, isoDate, parseDate } from '../lib/format'
import { locale, t } from '../lib/i18n'
import type { Session } from '../lib/types'

/** How long before its start time something opens by itself. */
const OPEN_EARLY_MS = 30 * 60_000
const ROTATE_EVERY_MS = 45_000

/**
 * A screen to leave at the door. Whatever is on today's timetable opens by itself shortly
 * before it starts and closes by itself afterwards, so nobody has to press anything.
 * The QR always rotates here: a photo of a screen that hangs on a wall is the obvious cheat.
 */
export function Kiosk() {
  const profile = useProfile()
  const sessions = useMySessions()
  const classes = useMyClasses()
  const now = useNow(15_000)
  const today = isoDate(new Date(now))
  const [pick, setPick] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const tried = useRef(new Set<string>())

  const items = sessions.data && classes.data ? agendaFor(today, sessions.data, classes.data, today) : []
  const opensAt = (i: AgendaItem) => parseDate(i.date, i.startTime).getTime() - OPEN_EARLY_MS
  const due = items.filter(
    (i) => (i.state === 'planned' || i.state === 'scheduled') && now >= opensAt(i) && now < parseDate(i.date, i.endTime).getTime(),
  )
  const dueKeys = due.map((i) => i.key).join(',')

  // Open what is due. Each one is tried once per visit; a failure shows a note instead of looping.
  useEffect(() => {
    for (const item of due) {
      if (tried.current.has(item.key)) continue
      tried.current.add(item.key)
      const start = item.session
        ? startSession(item.session, true)
        : startClassSession(profile, item.due!.cls, item.date, item.due!.slot, true)
      Promise.resolve(start).catch(() => setFailed(true))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueKeys])

  // Keep a tablet awake while this screen is showing, where the browser allows it.
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null
    const wake = () => {
      const api = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock
      if (document.visibilityState === 'visible') api?.request('screen').then((l) => (lock = l), () => {})
    }
    wake()
    document.addEventListener('visibilitychange', wake)
    return () => {
      document.removeEventListener('visibilitychange', wake)
      lock?.release().catch(() => {})
    }
  }, [])

  if (sessions.loading || classes.loading) return <PageLoader />

  const open = items.filter((i) => i.state === 'active' && i.session)
  const shown = open.find((i) => i.key === pick) ?? open[0]
  const next = items.find((i) => (i.state === 'planned' || i.state === 'scheduled') && now < opensAt(i))
  const clock = new Date(now)

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
        <Logo />
        <p className="tabular text-right leading-tight">
          <span className="block text-2xl font-semibold tracking-tight">{formatClock(clock)}</span>
          <span className="block text-xs text-muted capitalize">{clock.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        </p>
      </header>

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[2vh] p-5 text-center">
        {shown ? (
          <Door key={shown.session!.id} session={shown.session!} />
        ) : (
          <>
            <h1 className="text-[clamp(1.5rem,4vw,3rem)] font-semibold tracking-tight">{t('Nothing is open right now')}</h1>
            <p className="max-w-xl text-[clamp(1rem,2vw,1.5rem)] text-muted">
              {failed
                ? t('We could not open it by ourselves. Check the internet connection, or open it from the Today page.')
                : next
                  ? t('{name} opens by itself at {time}. Leave this screen on.', { name: next.name, time: formatClock(new Date(opensAt(next))) })
                  : t('Nothing more is planned for today. Leave this screen on and tomorrow opens by itself.')}
            </p>
          </>
        )}
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm">
        <div className="flex flex-wrap gap-2">
          {open.length > 1 &&
            open.map((i) => (
              <button
                key={i.key}
                onClick={() => setPick(i.key)}
                className={`rounded-full px-3 py-1.5 font-medium ${i.key === shown?.key ? 'bg-ink text-white' : 'bg-canvas'}`}
              >
                {i.name}
              </button>
            ))}
        </div>
        <ExitControl />
      </footer>
    </div>
  )
}

const PIN_KEY = 'attend.doorPin'
const readPin = () => {
  try {
    return localStorage.getItem(PIN_KEY) ?? ''
  } catch {
    return ''
  }
}

/**
 * Leaving the door screen lands in the manager's account, so it can be locked with a PIN
 * kept on this device. A forgotten PIN is solved by logging out, which is safe for a
 * tablet anyone can pick up.
 */
function ExitControl() {
  const navigate = useNavigate()
  const [pin, setPin] = useState(readPin)
  const [mode, setMode] = useState<'idle' | 'ask' | 'set'>('idle')
  const [typed, setTyped] = useState('')
  const [wrong, setWrong] = useState(false)
  const button = 'rounded-md bg-canvas px-4 py-2 font-medium'

  const submit = () => {
    if (mode === 'set') {
      if (!/^\d{4,6}$/.test(typed)) return setWrong(true)
      try {
        localStorage.setItem(PIN_KEY, typed)
      } catch {
        // Not remembered on this device; the screen simply stays unlocked.
      }
      setPin(typed)
      setMode('idle')
    } else if (typed === pin) navigate('/app')
    else {
      // Start again with an empty box, so the next try is not added to the wrong digits.
      setTyped('')
      return setWrong(true)
    }
    setTyped('')
    setWrong(false)
  }

  if (mode === 'idle') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {!pin && <button onClick={() => setMode('set')} className="px-2 py-2 font-medium text-accent">{t('Lock with a PIN')}</button>}
        <button onClick={() => (pin ? setMode('ask') : navigate('/app'))} className={button}>{t('Exit door screen')}</button>
      </div>
    )
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <label className="flex items-center gap-2">
        <span className={wrong ? 'text-bad' : 'text-muted'}>
          {mode === 'set' ? (wrong ? t('Use 4 to 6 digits') : t('Choose a PIN')) : wrong ? t('Wrong PIN') : t('PIN')}
        </span>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={typed}
          onChange={(e) => setTyped(e.target.value.replace(/\D/g, ''))}
          className="tabular h-10 w-28 rounded-md border border-line px-3 text-center tracking-[0.3em]"
        />
      </label>
      <button type="submit" className="rounded-md bg-ink px-4 py-2 font-medium text-white">{mode === 'set' ? t('Save') : t('Exit')}</button>
      <button type="button" onClick={() => { setMode('idle'); setTyped(''); setWrong(false) }} className={button}>{t('Cancel')}</button>
      {mode === 'ask' && <button type="button" onClick={() => signOut()} className="px-2 py-2 font-medium text-accent">{t('Forgot the PIN? Log out')}</button>}
    </form>
  )
}

/** One open session at the door: a big QR, the count, and who scanned last. */
function Door({ session }: { session: Session }) {
  const profile = useProfile()
  const records = useSessionAttendance(session, profile).data ?? []
  const latest = records[records.length - 1]
  const url = attendUrl(session.token!) + (session.qrCode ? `?c=${session.qrCode}` : '')

  // This screen issues the new code every 45 seconds.
  const current = useRef(session)
  current.current = session
  useEffect(() => {
    if (!session.qrCode) return
    const id = setInterval(() => rotateCode(current.current).catch(() => {}), ROTATE_EVERY_MS)
    return () => clearInterval(id)
  }, [session.id, Boolean(session.qrCode)])

  // Close for the day when the window lapses.
  const expiresAt = session.expiresAt?.toMillis()
  useEffect(() => {
    if (!expiresAt) return
    const wait = expiresAt - Date.now()
    if (wait > 2 ** 31 - 1) return
    const id = setTimeout(() => endSession(current.current).catch(() => {}), Math.max(0, wait))
    return () => clearTimeout(id)
  }, [session.id, expiresAt])

  return (
    <>
      <div>
        <h1 className="text-[clamp(1.5rem,4vw,3rem)] font-semibold tracking-tight">{session.name}</h1>
        <p className="tabular text-[clamp(0.9rem,1.6vw,1.25rem)] text-muted">{formatRange(session)}</p>
      </div>
      <QRCodeSVG value={url} level="M" marginSize={2} style={{ width: 'min(52vh, 86vw)', height: 'min(52vh, 86vw)' }} />
      <p className="text-[clamp(1rem,2vw,1.6rem)]">{t('Scan this QR to mark attendance')}</p>
      {session.qrCode && (
        <p className="text-[clamp(0.9rem,1.6vw,1.25rem)]">
          <span className="text-muted">{t('Code')}: </span>
          <span className="font-mono font-semibold tracking-[0.3em]">{session.qrCode}</span>
        </p>
      )}
      <p className="tabular text-[clamp(1rem,2vw,1.5rem)] font-semibold">
        {countPresent(records)}
        {session.expected ? ` / ${session.expected}` : ''} <span className="font-normal text-muted">{t('PRESENT')}</span>
        {latest && <span className="ml-4 font-normal text-good">✓ {latest.studentName}</span>}
      </p>
    </>
  )
}
