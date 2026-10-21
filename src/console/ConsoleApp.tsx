import { type User, onAuthStateChanged } from 'firebase/auth'
import { type FormEvent, type ReactNode, Suspense, lazy, useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Button, Card, ErrorNote, Field, Logo, PageLoader } from '../components/ui'
import { resetPassword, signIn, signInWithGoogle, signOut } from '../data/account'
import { ROLE_LABEL, type StaffRole, can, claimInvite, staffRoleOf } from '../data/platform'
import { auth } from '../lib/auth'
import { t } from '../lib/i18n'
import { setPurpose } from '../lib/purpose'
import { InstallApp } from '../components/InstallApp'
import { LanguageSwitch } from '../components/LanguageSwitch'
import { useConsoleApp } from '../lib/install'
import { OwnerDataProvider } from './context'

const Dashboard = lazy(() => import('./Dashboard'))
const Customers = lazy(() => import('./Customers'))
const CustomerDetail = lazy(() => import('./CustomerDetail'))
const Subscriptions = lazy(() => import('./Subscriptions'))
const Limits = lazy(() => import('./Limits'))
const Billing = lazy(() => import('./Billing'))
const Users = lazy(() => import('./Users'))
const Tasks = lazy(() => import('./Tasks'))
const Team = lazy(() => import('./Team'))
const Audit = lazy(() => import('./Audit'))
const Announcements = lazy(() => import('./Announcements'))
const Settings = lazy(() => import('./Settings'))
const Account = lazy(() => import('./Account'))
const Pricing = lazy(() => import('./Pricing'))
const Growth = lazy(() => import('./Growth'))

/**
 * Dobry Console, the back office, separate from the customers' app: its own address (/console), sign-in, frame
 * and bundle. Only the team in platformOwners gets in, each with a role.
 */
export default function ConsoleApp() {
  useConsoleApp()
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [role, setRole] = useState<StaffRole | null | undefined>(undefined)
  useEffect(() => {
    // Plain words: none of a customer edition's word swaps apply here.
    setPurpose(undefined)
    return onAuthStateChanged(auth, async (u) => {
      setUser(u)
      setRole(undefined)
      if (!u) return
      // A new team member's first visit takes up their invitation.
      const found = (await staffRoleOf(u.uid)) ?? (u.emailVerified && u.email ? await claimInvite(u.uid, u.email) : null)
      setRole(found)
    })
  }, [])
  if (user === undefined || (user && role === undefined)) return <PageLoader />
  if (!user) return <OwnerLogin />
  if (!role)
    return (
      <Bare>
        <Card className="mx-auto mt-16 max-w-sm p-6 text-center">
          <h1 className="text-xl font-semibold">{t('Not on the Dobry team')}</h1>
          <p className="mt-2 text-sm text-muted">{t('{email} has no access to the back office. If you were invited, sign in with the invited email after verifying it.', { email: user.email ?? '' })}</p>
          <Button className="mt-6" variant="secondary" onClick={() => signOut()}>{t('Log out')}</Button>
        </Card>
      </Bare>
    )
  const me = { id: user.uid, email: user.email ?? '', role }
  return (
    <OwnerDataProvider
      me={me}
      loading={<PageLoader />}
      failed={
        <Bare>
          <ErrorNote>{t('The back office could not be loaded. Check your connection, and that the rules are published.')}</ErrorNote>
        </Bare>
      }
    >
      <Shell email={me.email} role={role}>
        <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="customers" element={<Customers />} />
          <Route path="customers/:id" element={<CustomerDetail />} />
          <Route path="subscriptions" element={<Subscriptions />} />
          <Route path="limits" element={<Limits />} />
          <Route path="billing" element={<Billing />} />
          <Route path="pricing" element={<Pricing />} />
          <Route path="users" element={<Users />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="team" element={<Team />} />
          {can(role, 'audit') && <Route path="audit" element={<Audit />} />}
          <Route path="announcements" element={<Announcements />} />
          <Route path="growth" element={<Growth />} />
          <Route path="settings" element={<Settings />} />
          <Route path="account" element={<Account />} />
          <Route path="*" element={<Navigate to="/console" replace />} />
        </Routes>
        </Suspense>
      </Shell>
    </OwnerDataProvider>
  )
}

const ICON: Record<string, string> = {
  dashboard: 'M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z',
  customers: 'M3 21V7l9-4 9 4v14M9 21v-6h6v6',
  subscriptions: 'M4 7h16M4 12h16M4 17h10',
  billing: 'M4 5h16v14H4zM4 10h16M8 15h3',
  pricing: 'M20 12l-8 8-9-9V3h8l9 9ZM7.5 7.5h.01',
  limits: 'M4 20V10M10 20V4M16 20v-7M22 20H2M3 6h4M9 2h4',
  users: 'M16 19v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  tasks: 'M9 11l2 2 4-4M5 4h14v16H5z',
  team: 'M17 20v-1a4 4 0 0 0-3-3.9M7 20v-1a4 4 0 0 1 8 0v1M11 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM17 8a3 3 0 0 1 0 5',
  audit: 'M12 8v4l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  announcements: 'M4 10v4h3l5 4V6L7 10H4Zm13-2a5 5 0 0 1 0 8',
  growth: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7-3a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 2h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 22h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
}

function Shell({ email, role, children }: { email: string; role: StaffRole; children: ReactNode }) {
  // Grouped by the question being asked: who are our customers, where is the money, who does what.
  const groups: [string, [string, string, string][]][] = [
    ['', [['', t('Dashboard'), 'dashboard']]],
    [t('Customers'), [
      ['customers', t('Customers'), 'customers'],
      ['subscriptions', t('Subscriptions'), 'subscriptions'],
      ['limits', t('Plan limits'), 'limits'],
      ['users', t('Users'), 'users'],
    ]],
    [t('Growth'), [
      ['growth', t('Growth'), 'growth'],
      ['announcements', t('Announcements'), 'announcements'],
    ]],
    [t('Money'), [
      ['billing', t('Billing'), 'billing'],
      ['pricing', t('Pricing'), 'pricing'],
    ]],
    [t('Team'), [
      ['tasks', t('Tasks'), 'tasks'],
      ['team', t('Team & roles'), 'team'],
      ...(can(role, 'audit') ? ([['audit', t('Audit log'), 'audit']] as [string, string, string][]) : []),
      ['settings', t('Settings'), 'settings'],
    ]],
  ]
  // On a phone: the four pages opened most, and the rest behind Menu.
  const tabs: [string, string, string][] = [['', t('Home'), 'dashboard'], ['customers', t('Customers'), 'customers'], ['subscriptions', t('Plans'), 'subscriptions'], ['limits', t('Limits'), 'limits']]
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const icon = (name: string, size = 'size-4.5') => (
    <svg viewBox="0 0 24 24" className={`${size} shrink-0`} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICON[name]} />
    </svg>
  )
  return (
    <div className="min-h-dvh bg-canvas lg:pl-64">
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 flex-col bg-night text-white lg:flex ${open ? 'flex' : 'hidden'}`}>
        <div className="flex h-16 items-center gap-2 px-5">
          <Logo className="text-white" />
          <span className="rounded bg-sun px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-night uppercase">{t('Console')}</span>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3">
          {groups.map(([heading, items]) => (
            <div key={heading || 'top'}>
              {heading && <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-white/40 uppercase">{heading}</p>}
              <div className="space-y-0.5">
                {items.map(([to, label, name]) => (
                  <NavLink
                    key={to}
                    to={to ? `/console/${to}` : '/console'}
                    end={!to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-white/12 text-white shadow-[inset_3px_0_0_var(--color-sun)]' : 'text-white/65 hover:bg-white/6 hover:text-white'}`}
                  >
                    {icon(name)}
                    {label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 px-4 py-4 text-sm">
          <NavLink to="/console/account" onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-2 py-1.5 ${isActive ? 'bg-white/10' : 'hover:bg-white/6'}`}>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sun text-xs font-bold text-night">{email.slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0">
              <span className="block truncate text-white/90">{email}</span>
              <span className="block text-xs text-white/50">{t(ROLE_LABEL[role])}</span>
            </span>
          </NavLink>
          <div className="mt-2 flex items-center justify-between gap-2 px-2">
            <button type="button" onClick={() => signOut()} className="text-xs font-medium text-white/60 hover:text-white">{t('Log out')}</button>
            <LanguageSwitch className="!bg-white/10 [&_button]:!text-white/70 [&_button[aria-pressed=true]]:!bg-white [&_button[aria-pressed=true]]:!text-night" />
          </div>
        </div>
      </aside>
      {open && <button type="button" aria-label={t('Close menu')} className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-white/90 px-4 backdrop-blur lg:hidden">
        <Logo />
        <span className="rounded bg-night px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-sun uppercase">{t('Console')}</span>
        <LanguageSwitch className="ml-auto" />
      </header>
      <main className="mx-auto max-w-7xl space-y-5 px-4 pt-5 pb-28 sm:space-y-6 sm:px-6 lg:px-8 lg:py-8">
        {/* Offered once, on the first page, not in the way of every other one. */}
        {pathname.replace(/\/$/, '') === '/console' && <div className="empty:hidden"><InstallApp name="Dobry Console" /></div>}
        {children}
      </main>
      <nav aria-label={t('Console')} className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {tabs.map(([to, label, name]) => (
          <NavLink key={to} to={to ? `/console/${to}` : '/console'} end={!to} className={({ isActive }) => `flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${isActive ? 'text-accent' : 'text-slate-500'}`}>
            {icon(name, 'size-5')}
            {label}
          </NavLink>
        ))}
        <button type="button" onClick={() => setOpen(true)} aria-label={t('Open menu')} className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-slate-500">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          {t('Menu')}
        </button>
      </nav>
    </div>
  )
}

function Bare({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="bg-ink">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
          <Logo className="text-white" />
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-white uppercase">{t('Console')}</span>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  )
}

function OwnerLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState('')
  const forgot = async () => {
    setError('')
    setSent('')
    if (!email.trim()) return setError(t('Type your email first, then tap Forgot password.'))
    try {
      await resetPassword(email)
    } catch {
      // Say the same either way, so nobody can test which emails have accounts.
    }
    setSent(t('If {email} has an account, a reset link is on its way. Check your inbox (and spam).', { email: email.trim() }))
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await signIn(email, password)
    } catch {
      setError(t('Wrong email or password.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Bare>
      <Card className="mx-auto mt-12 max-w-sm p-6">
        <h1 className="text-xl font-semibold">{t('Dobry Console sign-in')}</h1>
        <p className="mt-1 text-sm text-muted">{t('For the Dobry team. Customers sign in at the usual page.')}</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field label={t('Email')} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Field label={t('Password')} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <ErrorNote>{error}</ErrorNote>
          {sent && <p className="rounded-lg bg-good-soft px-3 py-2 text-sm text-good">{sent}</p>}
          <Button type="submit" block busy={busy}>{t('Log in')}</Button>
          <button type="button" onClick={forgot} className="block w-full text-center text-sm font-medium text-accent hover:underline">{t('Forgot password?')}</button>
        </form>
        <Button className="mt-3" variant="secondary" block onClick={() => signInWithGoogle().catch(() => setError(t('Google sign-in did not finish.')))}>{t('Continue with Google')}</Button>
      </Card>
    </Bare>
  )
}
