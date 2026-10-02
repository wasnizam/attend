import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useRef, useState } from 'react'
import { endSession, rotateCode, setRotating } from '../data/sessions'
import { useAbsentees } from '../hooks/useRoster'
import { attendUrl, countPresent, courseLine, formatClock24, formatPercent, formatRange, percent } from '../lib/format'
import { t } from '../lib/i18n'
import { has } from '../lib/purpose'
import { setRotatePref } from '../lib/prefs'
import type { AttendanceRecord, Session } from '../lib/types'
import { GeofenceControl } from './GeofenceControl'
import { PresenceCheck } from './PresenceCheck'
import { RemoteLine } from './SessionCard'
import { SessionRecords } from './SessionRecords'
import { Button, Card, ErrorNote, Stat, StatusBadge, friendlyError } from './ui'

const ROTATE_EVERY_MS = 45_000

interface Props {
  session: Session
  records: AttendanceRecord[]
  /** The session's owner runs it: only their screen rotates the QR. */
  owner: boolean
}

/** The running session: QR for the room on one side, live attendance on the other. */
export function LiveSession({ session, records, owner }: Props) {
  const [projector, setProjector] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [ending, setEnding] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const absentees = useAbsentees(session, records)
  const rotating = Boolean(session.qrCode)
  // The QR carries the current code. The plain link (for a meeting chat) does not, so
  // students who open it type the code shown here instead.
  const link = attendUrl(session.token!)
  const url = link + (rotating ? `?c=${session.qrCode}` : '')
  const typedCode = rotating && (
    <div className="mx-auto mt-4 max-w-72 rounded-lg bg-canvas px-4 py-3">
      <p className="text-xs text-muted">{t('Or open the link and type this code')}</p>
      <p className="tabular mt-1 font-mono text-3xl font-semibold tracking-[0.3em]">{session.qrCode}</p>
    </div>
  )
  const present = countPresent(records)
  const excused = records.length - present
  const pct = percent(present, session.expected)
  const absent = session.rosterId
    ? absentees.length
    : session.expected
      ? Math.max(0, session.expected - records.length)
      : null
  const latest = records[records.length - 1]

  const end = async () => {
    setEnding(true)
    setError('')
    try {
      await endSession(session)
    } catch (e) {
      setError(friendlyError(e))
      setEnding(false)
      setConfirming(false)
    }
  }

  // Close automatically when the QR window lapses while this screen is open.
  const expiresAt = session.expiresAt?.toMillis()
  useEffect(() => {
    if (!expiresAt || !owner) return
    const wait = expiresAt - Date.now()
    // setTimeout overflows past ~24 days; sessions that far out simply never auto-close here.
    if (wait > 2 ** 31 - 1) return
    const id = setTimeout(() => endSession(session).catch(() => {}), Math.max(0, wait))
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, expiresAt, owner])

  // Rotating QR: this screen issues a new code every 45 seconds. A scan stays valid for
  // the current code and the one before it, so a forwarded link or photo goes stale fast.
  const current = useRef(session)
  current.current = session
  useEffect(() => {
    if (!rotating || !owner) return
    const id = setInterval(() => rotateCode(current.current).catch(() => {}), ROTATE_EVERY_MS)
    return () => clearInterval(id)
  }, [rotating, owner, session.id])

  const toggleRotating = async () => {
    setError('')
    try {
      await setRotating(session, !rotating)
      setRotatePref(!rotating)
    } catch (e) {
      setError(friendlyError(e))
    }
  }

  // Keep the lecturer's screen awake while the QR is on display.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    const acquire = () =>
      navigator.wakeLock
        ?.request('screen')
        .then((l) => (lock = l))
        .catch(() => {})
    acquire()
    const onVisible = () => document.visibilityState === 'visible' && acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release().catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (!projector) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setProjector(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [projector])

  const count = (
    <p className="tabular font-semibold tracking-tight">
      {present}
      {session.expected ? ` / ${session.expected}` : ''} <span className="text-muted">{t('PRESENT')}</span>
    </p>
  )

  if (projector) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-[2vh] bg-white p-6 text-center">
        <button
          onClick={() => setProjector(false)}
          className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 rounded-md bg-canvas px-4 py-2 text-sm font-medium"
        >
          {t('Close')}
        </button>
        <h1 className="text-[clamp(1.5rem,4vw,3.5rem)] font-semibold tracking-tight">{session.name}</h1>
        <div className="text-[clamp(1.25rem,3vw,2.5rem)]">{count}</div>
        <QRCodeSVG value={url} level="M" marginSize={2} style={{ width: 'min(62vh, 88vw)', height: 'min(62vh, 88vw)' }} />
        <p className="text-[clamp(1rem,2vw,1.75rem)] text-muted">{t('Scan this QR to mark attendance')}</p>
        {rotating && (
          <p className="text-[clamp(1rem,2vw,1.75rem)]">
            <span className="text-muted">{t('Code')}: </span>
            <span className="font-mono font-semibold tracking-[0.3em]">{session.qrCode}</span>
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
      <Card className="p-6 text-center">
        <h1 className="text-xl font-semibold tracking-tight uppercase">{session.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {formatRange(session)}
          {courseLine(session) && ` · ${courseLine(session)}`}
        </p>
        <div className="flex justify-center">
          <RemoteLine item={session} />
        </div>
        <div className="mt-4 text-3xl">{count}</div>

        <button
          onClick={() => setProjector(true)}
          aria-label={t('Show QR full screen')}
          className="mx-auto mt-5 block w-full max-w-72 rounded-xl border border-line p-3 transition hover:shadow-card"
        >
          <QRCodeSVG value={url} level="M" marginSize={1} style={{ width: '100%', height: 'auto' }} />
        </button>

        <p className="mt-4 font-medium">{t('Scan this QR to mark attendance')}</p>
        <p className="mt-1 text-sm break-all text-muted">{link}</p>
        {typedCode}
        <div className="mt-4">
          <StatusBadge status="active" />
        </div>
        {/* On a phone the list is below the fold, so the newest arrival is echoed here. */}
        {latest && (
          <p className="mt-3 truncate text-sm text-muted lg:hidden">
            {t('Latest')}: <span className="font-medium text-ink">{latest.studentName}</span> · {formatClock24(latest.timestamp)}
          </p>
        )}

        <div className="mt-6 space-y-3">
          <ErrorNote>{error}</ErrorNote>
          {owner && (
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-canvas px-4 py-3 text-left">
              <span>
                <span className="block text-sm font-semibold">{t('Rotating code')}</span>
                <span className="block text-xs text-muted">
                  {t('The QR and code change every 45 seconds, so a forwarded link or photo stops working.')}
                </span>
              </span>
              <input type="checkbox" role="switch" checked={rotating} onChange={toggleRotating} className="size-5 shrink-0 accent-accent" />
            </label>
          )}
          {owner && session.delivery !== 'online' && <GeofenceControl session={session} />}
          <div className="flex gap-2">
            <Button variant="secondary" block onClick={() => setProjector(true)}>
              {t('Full screen')}
            </Button>
            {(
              <Button
                variant="secondary"
                block
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  } catch {
                    setError(t('Could not copy. Select the link above and copy it manually.'))
                  }
                }}
              >
                {copied ? t('Copied') : t('Copy link')}
              </Button>
            )}
          </div>
          {confirming ? (
            <div className="flex gap-2">
              <Button variant="secondary" block onClick={() => setConfirming(false)} disabled={ending}>
                {t('Keep open')}
              </Button>
              <Button variant="danger" block busy={ending} onClick={end}>
                {t('Yes, end it')}
              </Button>
            </div>
          ) : (
            <Button variant="danger" size="lg" block onClick={() => setConfirming(true)}>
              {t('End Attendance')}
            </Button>
          )}
          {confirming && <p className="text-xs text-muted">{t('This QR stops working. You can still correct the record afterwards.')}</p>}
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="text-xs font-semibold tracking-wider text-muted">{t('LIVE ATTENDANCE')}</h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label={t('Present')} value={present} />
          <Stat label={excused ? t('Absent · Excused / MC') : t('Absent')} value={absent === null ? '—' : excused ? `${absent} · ${excused}` : absent} />
          <Stat label={t('Attendance')} value={formatPercent(pct)} />
        </div>
        {owner && (
          <div className="mt-3">
            {/* "Still here?" is for a class or an online session, not for a working day. */}
            {!has('clock') && <PresenceCheck session={session} records={records} />}
          </div>
        )}
        <div className="mt-5">
          <SessionRecords
            session={session}
            records={records}
            live
            emptyTitle={t('Waiting for the first scan')}
            emptyText={t('Students open their phone camera, point it at the QR and tap the link. Names appear here the moment they check in. Try it with your own phone.')}
          />
        </div>
      </Card>
    </div>
  )
}
