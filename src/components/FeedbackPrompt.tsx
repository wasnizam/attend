import { useEffect, useState } from 'react'
import { auth } from '../lib/auth'
import { t } from '../lib/i18n'
import type { Session } from '../lib/types'
import { Button, Card } from './ui'

const KEY = 'dobry.feedback'
const DAY = 86_400_000

async function call<T>(body: object): Promise<T> {
  const token = await auth.currentUser?.getIdToken()
  const res = await fetch('/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token ?? ''}` }, body: JSON.stringify(body) })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(data.error ? t(data.error) : t('That did not go through. Please try again.'))
  return data as T
}

function remembered(): { answered?: boolean; until?: number } {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}
  } catch {
    return {}
  }
}
function remember(value: { answered?: boolean; until?: number }) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value))
  } catch {
    // Asked again on this device another day; the server still keeps one answer.
  }
}

/**
 * One question, asked once someone has really used Dobry (three sessions with people in them, the
 * first at least two weeks ago): would they recommend it, why, and may Dobry quote them. "Not now"
 * asks again in a month.
 */
export function FeedbackPrompt({ sessions, today }: { sessions: Session[]; today: string }) {
  const used = sessions.filter((s) => s.status !== 'scheduled' && (s.presentCount ?? 0) > 0)
  const firstDate = used.map((s) => s.date).sort()[0]
  const eligible = used.length >= 3 && Boolean(firstDate) && Date.parse(`${today}T00:00:00`) - Date.parse(`${firstDate}T00:00:00`) >= 14 * DAY
  const [show, setShow] = useState(false)
  const [score, setScore] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [quoteOk, setQuoteOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!eligible) return
    const r = remembered()
    if (r.answered || (r.until && Date.now() < r.until)) return
    let stale = false
    // Answered on another device: do not ask here.
    call<{ answered: boolean }>({ action: 'status' }).then(
      (s) => {
        if (stale) return
        if (s.answered) remember({ answered: true })
        else setShow(true)
      },
      () => {},
    )
    return () => {
      stale = true
    }
  }, [eligible])

  if (!show) return null
  if (done)
    return (
      <Card className="p-5">
        <p className="font-semibold">{t('Thank you.')}</p>
        <p className="text-sm text-muted">{t('Every answer is read by the people who build Dobry.')}</p>
      </Card>
    )

  const submit = async () => {
    if (score === null) return
    setBusy(true)
    setError('')
    try {
      await call({ action: 'submit', score, comment: comment.trim(), quoteOk })
      remember({ answered: true })
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{t('How likely are you to recommend Dobry to a colleague?')}</p>
          <p className="text-sm text-muted">{t('One question. It helps us make Dobry better.')}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            remember({ until: Date.now() + 30 * DAY })
            setShow(false)
          }}
          className="shrink-0 text-sm font-medium text-muted hover:text-ink"
        >
          {t('Not now')}
        </button>
      </div>
      <div>
        <div className="grid grid-cols-11 gap-1" role="radiogroup" aria-label={t('How likely are you to recommend Dobry to a colleague?')}>
          {Array.from({ length: 11 }, (_, n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={score === n}
              onClick={() => setScore(n)}
              className={`tabular h-10 rounded-md text-sm font-semibold ring-1 transition ${score === n ? 'bg-accent text-white ring-accent' : 'bg-white text-ink ring-line hover:ring-accent'}`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted">
          <span>{t('Not likely')}</span>
          <span>{t('Very likely')}</span>
        </div>
      </div>
      {score !== null && (
        <div className="space-y-3">
          <label className="block text-sm font-medium">
            {score >= 9 ? t('What do you like most?') : score >= 7 ? t('What would make it a 10?') : t('What should we fix first?')}
            <textarea id="feedback-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} rows={3} className="mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm" />
          </label>
          {score >= 7 && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={quoteOk} onChange={(e) => setQuoteOk(e.target.checked)} className="mt-0.5 size-4 accent-accent" />
              <span>{t('Dobry may quote what I wrote, with my name and organisation, on its website.')}</span>
            </label>
          )}
          {error && <p className="text-sm text-bad">{error}</p>}
          <Button busy={busy} onClick={submit}>{t('Send')}</Button>
        </div>
      )}
    </Card>
  )
}
