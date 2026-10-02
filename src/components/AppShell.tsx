import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { resendVerification } from '../data/account'
import { useAuth, useProfile } from '../hooks/useAuth'
import { t } from '../lib/i18n'
import { has } from '../lib/purpose'
import { Logo, buttonClass } from './ui'

const icons = {
  today: 'M3 11.500 12 4l9 7.500M5.500 10v9.500h13V10',
  timetable: 'M4 6h16M4 12h16M4 18h10',
  calendar: 'M4 5h16v15H4zM4 10h16M9 5v15M15 5v15M4 15h16',
  students: 'M16 20v-1.500a3.500 3.500 0 0 0-3.500-3.500h-5A3.500 3.500 0 0 0 4 18.500V20M10 11a3.500 3.500 0 1 0 0-7 3.500 3.500 0 0 0 0 7ZM20 20v-1.500a3.500 3.500 0 0 0-2.500-3.350M15.500 4.150a3.500 3.500 0 0 1 0 6.700',
  history: 'M12 7v5l3 2M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4v4h4',
  reports: 'M4 20v-7M10 20V4M16 20v-10M22 20H2',
  admin: 'M12 3l7 3v5c0 4.500-3 8-7 10-4-2-7-5.500-7-10V6l7-3Z',
  plus: 'M12 5v14M5 12h14',
}

function Icon({ d, className = 'size-5' }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}

/** A gentle nudge, not a gate: the app works before the email is verified. */
function VerifyBanner() {
  const { user } = useAuth()
  const [state, setState] = useState<'idle' | 'sent' | 'failed'>('idle')
  const needs = user && !user.emailVerified && user.providerData.some((p) => p.providerId === 'password')
  if (!needs) return null
  return (
    <div className="border-b border-indigo-100 bg-accent-soft px-4 py-2 text-center text-sm text-indigo-900 print:hidden">
      {state === 'sent' ? (
        t('Verification email sent. Check your inbox.')
      ) : (
        <>
          {t('Please verify your email address.')}{' '}
          <button
            className="font-semibold text-accent underline-offset-2 hover:underline"
            onClick={() => resendVerification().then(() => setState('sent'), () => setState('failed'))}
          >
            {state === 'failed' ? t('Could not send. Try again') : t('Resend email')}
          </button>
        </>
      )}
    </div>
  )
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

/**
 * Desktop: a fixed sidebar, the way most SaaS tools are laid out.
 * Phone: a slim top bar and a bottom tab bar, so it feels like an app in one hand.
 */
export function AppShell() {
  const profile = useProfile()
  const item = (to: string, label: string, icon: string, end = false) => ({ to, label, icon, end })
  const today = item('/app', t('Today'), icons.today, true)
  const students = item('/app/students', t('Students'), icons.students)
  const history = item('/app/history', t('History'), icons.history)
  const calendar = item('/app/calendar', t('Calendar'), icons.calendar)
  const adminItem = profile.role === 'admin' ? [item('/admin', t('Admin'), icons.admin)] : []
  // Timetable and class reports only exist for organisations that run repeating classes.
  const recurring = has('recurring')
    ? { timetable: [item('/app/timetable', t('Timetable'), icons.timetable)], reports: [item('/app/reports', t('Reports'), icons.reports)] }
    : { timetable: [], reports: [] }

  // The phone tab bar has room for five; Calendar (and History, when Reports is shown)
  // live in the sidebar and are one tap from Today or Reports on a phone.
  const tabs = [today, ...recurring.timetable, students, ...(recurring.reports.length ? recurring.reports : [history]), ...adminItem]
  // Workplaces leave a tablet at the door; the link opens that full-screen view.
  const door = has('clock')
    ? [...(has('shifts') ? [item('/app/plan', t('Shift plan'), icons.calendar)] : [])]
    : []
  const sidebar = [today, ...door, calendar, ...recurring.timetable, students, ...recurring.reports, history, ...adminItem]

  return (
    <div className="min-h-dvh md:pl-60 print:!pl-0">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-white md:flex print:!hidden">
        <NavLink to="/app" aria-label={t('Attend home')} className="flex h-16 items-center px-5">
          <Logo />
        </NavLink>
        <div className="px-3">
          {/* A workplace sets its hours once; what it does every day is open the door screen. */}
          {has('clock') ? (
            <Link to="/app/door" className={buttonClass({ block: true })}>
              {t('Open door screen')}
            </Link>
          ) : (
            <Link to="/app/new" className={buttonClass({ block: true })}>
              <Icon d={icons.plus} className="size-4" />
              {t('New session')}
            </Link>
          )}
        </div>
        <nav className="mt-4 flex-1 space-y-0.5 px-3">
          {sidebar.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-slate-100 text-ink' : 'text-slate-600 hover:bg-slate-50 hover:text-ink'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon d={tab.icon} className={`size-5 ${isActive ? 'text-accent' : 'text-slate-400'}`} />
                  {tab.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <NavLink
          to="/app/account"
          className={({ isActive }) =>
            `m-3 flex items-center gap-3 rounded-lg p-2 text-left transition-colors ${isActive ? 'bg-slate-100' : 'hover:bg-slate-50'}`
          }
        >
          <Avatar name={profile.name} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{profile.name}</span>
            <span className="block truncate text-xs text-muted">{profile.email}</span>
          </span>
        </NavLink>
      </aside>

      <header className="sticky top-0 z-20 border-b border-line bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden print:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <NavLink to="/app" aria-label={t('Attend home')}>
            <Logo />
          </NavLink>
          <NavLink to="/app/account" aria-label={t('Account')}>
            <Avatar name={profile.name} />
          </NavLink>
        </div>
      </header>

      <VerifyBanner />

      <main className="mx-auto max-w-5xl px-4 pt-6 pb-28 md:px-8 md:pt-10 md:pb-16">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden">
        <div className="mx-auto flex max-w-md">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${isActive ? 'text-accent' : 'text-slate-500'}`
              }
            >
              <Icon d={tab.icon} className="size-6" />
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
