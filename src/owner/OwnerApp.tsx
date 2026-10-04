import { type User, onAuthStateChanged } from 'firebase/auth'
import { type FormEvent, type ReactNode, Suspense, lazy, useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { Button, Card, ErrorNote, Field, Logo, PageLoader } from '../components/ui'
import { resetPassword, signIn, signInWithGoogle, signOut } from '../data/account'
import { ROLE_LABEL, type StaffRole, can, claimInvite, staffRoleOf } from '../data/platform'
import { auth } from '../lib/auth'
import { t } from '../lib/i18n'
import { setPurpose } from '../lib/purpose'
import { OwnerDataProvider } from './context'

const Dashboard = lazy(() => import('./Dashboard'))
const Customers = lazy(() => import('./Customers'))
const CustomerDetail = lazy(() => import('./CustomerDetail'))
const Subscriptions = lazy(() => import('./Subscriptions'))
const Billing = lazy(() => import('./Billing'))
const Users = lazy(() => import('./Users'))
const Tasks = lazy(() => import('./Tasks'))
const Team = lazy(() => import('./Team'))
const Audit = lazy(() => import('./Audit'))
const Announcements = lazy(() => import('./Announcements'))
const Settings = lazy(() => import('./Settings'))
const Account = lazy(() => import('./Account'))

/**
 * Attend's back office, separate from the customers' app: its own address (/owner), sign-in, frame
 * and bundle. Only the team in platformOwners gets in, each with a role.
 */
export default function OwnerApp() {
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
          <h1 className="text-xl font-semibold">{t('Not on the Attend team')}</h1>
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
          <Route path="billing" element={<Billing />} />
          <Route path="users" element={<Users />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="team" element={<Team />} />
          {can(role, 'audit') && <Route path="audit" element={<Audit />} />}
          <Route path="announcements" element={<Announcements />} />
          <Route path="settings" element={<Settings />} />
          <Route path="account" element={<Account />} />
          <Route path="*" element={<Navigate to="/owner" replace />} />
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
  users: 'M16 19v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  tasks: 'M9 11l2 2 4-4M5 4h14v16H5z',
  team: 'M17 20v-1a4 4 0 0 0-3-3.9M7 20v-1a4 4 0 0 1 8 0v1M11 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM17 8a3 3 0 0 1 0 5',
  audit: 'M12 8v4l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  announcements: 'M4 10v4h3l5 4V6L7 10H4Zm13-2a5 5 0 0 1 0 8',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7-3a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 2h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 22h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
}

function Shell({ email, role, children }: { email: string; role: StaffRole; children: ReactNode }) {
  const nav: [string, string, string][] = [
    ['', t('Dashboard'), 'dashboard'],
    ['customers', t('Customers'), 'customers'],
    ['subscriptions', t('Subscriptions'), 'subscriptions'],
    ['billing', t('Billing'), 'billing'],
    ['users', t('Users'), 'users'],
    ['tasks', t('Tasks'), 'tasks'],
    ['announcements', t('Announcements'), 'announcements'],
    ['team', t('Team & roles'), 'team'],
    ...(can(role, 'audit') ? ([['audit', t('Audit log'), 'audit']] as [string, string, string][]) : []),
    ['settings', t('Settings'), 'settings'],
  ]
  const [open, setOpen] = useState(false)
  return (
    <div className="min-h-dvh bg-canvas lg:pl-60">
      <aside className={`fixed inset-y-0 left-0 z-40 w-60 flex-col bg-ink text-white lg:flex ${open ? 'flex' : 'hidden'}`}>
        <div className="flex h-14 items-center gap-2 px-5">
          <Logo className="text-white" />
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase">{t('Admin')}</span>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {nav.map(([to, label, icon]) => (
            <NavLink
              key={to}
              to={to ? `/owner/${to}` : '/owner'}
              end={!to}
              onClick={() => setOpen(false)}
              className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
            >
              <svg viewBox="0 0 24 24" className="size-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d={ICON[icon]} />
              </svg>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 px-5 py-4 text-sm">
          <NavLink to="/owner/account" onClick={() => setOpen(false)} className={({ isActive }) => `-mx-2 block rounded-lg px-2 py-1.5 ${isActive ? 'bg-white/10' : 'hover:bg-white/5'}`}>
            <p className="truncate text-white/90">{email}</p>
            <p className="text-xs text-white/50">{t(ROLE_LABEL[role])} · {t('My account')}</p>
          </NavLink>
          <button type="button" onClick={() => signOut()} className="mt-2 text-xs font-medium text-white/70 hover:text-white">{t('Log out')}</button>
        </div>
      </aside>
      {open && <button type="button" aria-label={t('Close menu')} className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-white px-4 lg:hidden">
        <button type="button" onClick={() => setOpen(true)} aria-label={t('Open menu')} className="rounded-md p-1.5 hover:bg-canvas">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <Logo />
        <span className="rounded bg-ink px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-white uppercase">{t('Admin')}</span>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  )
}

function Bare({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="bg-ink">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
          <Logo className="text-white" />
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-white uppercase">{t('Admin')}</span>
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
        <h1 className="text-xl font-semibold">{t('Attend admin sign-in')}</h1>
        <p className="mt-1 text-sm text-muted">{t('For the Attend team. Customers sign in at the usual page.')}</p>
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
