import { useState } from 'react'
import { Link } from 'react-router-dom'
import { effectiveStatus } from '../lib/format'
import { t } from '../lib/i18n'
import type { Session, WeeklyClass } from '../lib/types'
import { Card, buttonClass } from './ui'

const key = (userId: string) => `attend.guide.dismissed.${userId}`

function wasDismissed(userId: string): boolean {
  try {
    return localStorage.getItem(key(userId)) === '1'
  } catch {
    return false
  }
}

interface Step {
  title: string
  text: string
  done: boolean
  optional?: boolean
  action?: { label: string; to: string }
}

/**
 * First-run guide on the Today screen. Progress comes from what the lecturer has
 * actually done (classes, lists, sessions), so it never asks them to tick boxes.
 */
export function GettingStarted({ userId, sessions, classes, readyToday }: {
  userId: string
  sessions: Session[]
  classes: WeeklyClass[]
  /** There is a card on Today that can be started right now. */
  readyToday: boolean
}) {
  const [hidden, setHidden] = useState(() => wasDismissed(userId))

  const setDismissed = (value: boolean) => {
    try {
      if (value) localStorage.setItem(key(userId), '1')
      else localStorage.removeItem(key(userId))
    } catch {
      // Private browsing: the guide simply comes back next time.
    }
    setHidden(value)
  }

  const live = sessions.find((s) => effectiveStatus(s) === 'active')
  const lastEnded = sessions.find((s) => effectiveStatus(s) === 'ended' && s.status !== 'scheduled')
  const firstClass = classes[0]
  const hasAnything = sessions.length + classes.length > 0
  const started = sessions.some((s) => s.status !== 'scheduled')

  const steps: Step[] = [
    {
      title: t('Add a class or session'),
      text: t('Add the classes you teach this semester once, or create a one-off session for an extra class or event.'),
      done: hasAnything,
      action: { label: t('Add your first class'), to: '/app/new?weekly=1' },
    },
    {
      title: t('Upload your student list'),
      text: t('Excel, CSV or PDF. Students then only type their ID, and you see exactly who is absent.'),
      done: classes.some((c) => (c.rosterCount ?? 0) > 0),
      optional: true,
      action: firstClass ? { label: t('Upload a list'), to: `/app/timetable/${firstClass.id}/students` } : undefined,
    },
    {
      title: t('Start attendance and show the QR'),
      text: readyToday
        ? t('Tap Start Attendance on the card above and put the QR on the projector. Students scan it with their phone camera. No app to install.')
        : t('On the day of a class, its card appears here with a Start Attendance button. Students scan the QR with their phone camera. No app to install.'),
      done: started,
      action: live
        ? { label: t('Show QR'), to: `/app/session/${live.id}` }
        : readyToday
          ? undefined
          : { label: t('Try it now with a test session'), to: '/app/new' },
    },
    {
      title: t('End the session and export'),
      text: t('Tap End Attendance when everyone has scanned. The record is saved in History, ready to export for Excel. You can still correct it afterwards.'),
      done: Boolean(lastEnded),
      action: live ? { label: t('Open the live session'), to: `/app/session/${live.id}` } : undefined,
    },
  ]

  const required = steps.filter((s) => !s.optional)
  const doneCount = required.filter((s) => s.done).length
  const allDone = doneCount === required.length
  const current = steps.find((s) => !s.done && !s.optional)

  if (hidden) {
    return (
      <button onClick={() => setDismissed(false)} className="text-sm font-medium text-accent">
        {t('How does this work? Show the guide')}
      </button>
    )
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{allDone ? t('You are all set') : t('Getting started')}</h2>
          <p className="mt-0.5 text-sm text-muted">
            {allDone
              ? t('That is the whole workflow: add, start, scan, end.')
              : t('{done} of {total} done. The whole thing takes about two minutes.', { done: steps.filter((x) => x.done).length, total: steps.length })}
          </p>
        </div>
        <button onClick={() => setDismissed(true)} className="shrink-0 text-sm font-medium text-muted hover:text-ink">
          {allDone ? t('Close') : t('Hide')}
        </button>
      </div>

      <ol className="mt-5 space-y-1">
        {steps.map((step, i) => {
          const isCurrent = step === current
          const suggest = isCurrent || (step.optional && !step.done && hasAnything)
          return (
            <li key={step.title} className={`flex gap-3 rounded-lg p-3 ${isCurrent ? 'bg-accent-soft' : ''}`}>
              <span
                aria-hidden
                className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  step.done ? 'bg-good text-white' : isCurrent ? 'bg-accent text-white' : 'bg-canvas text-muted'
                }`}
              >
                {step.done ? '✓' : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`font-medium ${step.done ? 'text-muted line-through decoration-line' : ''}`}>
                  {step.title}
                  {step.optional && !step.done && <span className="ml-2 text-xs font-normal text-muted">{t('Optional')}</span>}
                  {step.done && <span className="sr-only"> (done)</span>}
                </p>
                {!step.done && (isCurrent || step.optional) && <p className="mt-0.5 text-sm text-muted">{step.text}</p>}
                {!step.done && suggest && step.action && (
                  <Link
                    to={step.action.to}
                    className={`mt-3 ${buttonClass({ variant: isCurrent ? 'primary' : 'secondary' })}`}
                  >
                    {step.action.label}
                  </Link>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
