import { type FormEvent, useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { LanguageSwitch } from '../components/LanguageSwitch'
import { Button, ErrorNote, Field, PageLoader, friendlyError } from '../components/ui'
import { getCheckIn, getClockOut } from '../data/attendance'
import { lookupStudent } from '../data/roster'
import { getSessionLink } from '../data/sessions'
import { formatRange, parseDate } from '../lib/format'
import { t } from '../lib/i18n'
import { setPurpose } from '../lib/purpose'
import type { SessionLink } from '../lib/types'

const REMEMBER_KEY = 'attend.me'
const remembered = (): string => {
  try {
    return JSON.parse(localStorage.getItem(REMEMBER_KEY) ?? '{}').studentId ?? ''
  } catch {
    return ''
  }
}

/**
 * Where the door screen's QR leads when more than one shift is open. The person gives
 * their ID once; this page works out which shift they belong to and hands over to the
 * ordinary check-in page for it.
 */
export default function DoorEntry() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const code = params.get('c')
  const tokens = (params.get('t') ?? '').split(',').filter((x) => /^[A-Z0-9]{6}$/.test(x)).slice(0, 8)
  const [links, setLinks] = useState<SessionLink[] | null>(null)
  const [staffId, setStaffId] = useState(remembered)
  const [choices, setChoices] = useState<SessionLink[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all(tokens.map((token) => getSessionLink(token).catch(() => null))).then((found) => {
      const open = found.filter((l): l is SessionLink => Boolean(l) && l!.status === 'active' && l!.expiresAt.toMillis() > Date.now())
      setPurpose(open[0]?.purpose)
      setLinks(open)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens.join(',')])

  const go = (link: SessionLink) => {
    try {
      // The check-in page pre-fills the ID it finds here, so it is typed only once.
      const kept = JSON.parse(localStorage.getItem(REMEMBER_KEY) ?? '{}')
      localStorage.setItem(REMEMBER_KEY, JSON.stringify({ ...kept, studentId: staffId.trim() }))
    } catch {
      // Private browsing: they type it again on the next page.
    }
    navigate(`/session/${link.token}${code ? `?c=${code}` : ''}`, { replace: true })
  }

  if (links === null) return <PageLoader />
  if (links.length === 0) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t('Attendance closed')}</h1>
        <p className="mt-2 text-muted">{t('Nothing is open right now. Scan the QR on the screen again.')}</p>
      </div>
    )
  }
  if (links.length === 1) return <Navigate to={`/session/${links[0].token}${code ? `?c=${code}` : ''}`} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!staffId.trim()) return
    setBusy(true)
    setError('')
    setChoices(null)
    try {
      const facts = await Promise.all(
        links.map(async (link) => ({
          link,
          listed: link.rosterId ? Boolean(await lookupStudent(link.rosterId, staffId)) : true,
          clockedIn: Boolean(await getCheckIn(link, staffId)),
          clockedOut: Boolean(await getClockOut(link, staffId)),
        })),
      )
      // Still in somewhere: they are here to clock out of that shift.
      const inNow = facts.find((f) => f.clockedIn && !f.clockedOut)
      if (inNow) return go(inNow.link)
      const mine = facts.filter((f) => f.listed && !f.clockedIn).map((f) => f.link)
      if (mine.length === 1) return go(mine[0])
      if (mine.length > 1) {
        // On more than one open shift (people who rotate): the time tells us which one. Someone
        // arriving now is starting the shift whose start is nearest; the rest are offered below it.
        const near = (l: SessionLink) => Math.abs(parseDate(l.date, l.startTime).getTime() - Date.now())
        const [best, ...others] = [...mine].sort((a, b) => near(a) - near(b))
        // Only ask when two shifts start within the same half hour of now.
        if (near(others[0]) - near(best) >= 30 * 60_000) return go(best)
        return setChoices([best, ...others])
      }
      const done = facts.find((f) => f.clockedOut)
      if (done) return go(done.link)
      setError(t('That ID is not on the class list. Check it and try again, or speak to your lecturer.'))
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <h1 className="text-center text-2xl font-semibold tracking-tight">{t('Clock in or out')}</h1>
      <p className="mt-1 text-center text-sm text-muted">{links.map((l) => l.name).join(' · ')}</p>
      {choices ? (
        <div className="mt-6 space-y-2">
          <p className="text-sm font-medium">{t('Which shift are you starting?')}</p>
          {choices.map((link) => (
            <button key={link.token} onClick={() => go(link)} className="flex w-full items-center justify-between rounded-lg bg-white px-4 py-3 text-left shadow-card hover:bg-accent-soft">
              <span className="font-semibold">{link.name}</span>
              <span className="tabular text-sm text-muted">{formatRange(link)}</span>
            </button>
          ))}
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label={t('Student ID')} required autoCapitalize="characters" autoComplete="off" maxLength={40} value={staffId} onChange={(e) => setStaffId(e.target.value)} />
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" size="lg" block busy={busy}>{t('Continue')}</Button>
        </form>
      )}
      <LanguageSwitch className="mx-auto mt-8 !bg-white" />
    </div>
  )
}
