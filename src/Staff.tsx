import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { Button, PageLoader } from './components/ui'
import { signOut, subscribeOrganisation } from './data/account'
import { isPlatformOwner } from './data/platform'
import { allows, setPlan } from './lib/plan'
import { setPhoneCheck, setPurpose, setShiftMode } from './lib/purpose'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { MySessionsProvider } from './hooks/useSessions'
import { t } from './lib/i18n'
import { Account } from './pages/Account'
import Admin from './pages/Admin'
import { Calendar } from './pages/Calendar'
import { Dashboard } from './pages/Dashboard'
import { History } from './pages/History'
import { Login } from './pages/Login'
import { NewSession } from './pages/NewSession'
import { Kiosk } from './pages/Kiosk'
import { Payroll } from './pages/Payroll'
import { Schedule } from './pages/Schedule'
import { Setup } from './pages/Setup'
import { Report } from './pages/Report'
import { Reports } from './pages/Reports'
import { Roster } from './pages/Roster'
import { SessionDetail } from './pages/SessionDetail'
import { Signup } from './pages/Signup'
import { Students } from './pages/Students'
import { SubjectReport } from './pages/SubjectReport'
import { useSwitches } from './lib/pricing'
import { refreshUsage } from './data/billing'
import { Timetable } from './pages/Timetable'

/**
 * Finds out what the organisation uses Dobry for before any screen is drawn, and
 * redraws everything if an admin changes it. The purpose picks the words and features.
 */
function PurposeGate({ organisationId, uid, children }: { organisationId: string; uid?: string; children: ReactNode }) {
  const [purpose, setLoaded] = useState<string | null>(null)
  const [suspended, setSuspended] = useState(false)
  const counted = useRef(false)
  // The Console's switch for paid plans: listened to here so every screen follows it at once.
  const selling = useSwitches().paymentsOpen
  useEffect(
    () =>
      subscribeOrganisation(organisationId, (org) => {
        setSuspended(Boolean(org?.suspended))
        if (org?.suspended && uid) isPlatformOwner(uid).then((owner) => owner && setSuspended(false))
        setPurpose(org?.purpose)
        setPlan(org)
        setShiftMode(org?.shifts && allows('shifts'))
        setPhoneCheck(org?.phoneCheck)
        setLoaded(`${org?.purpose ?? 'education'}:${org?.plan ?? 'early'}:${org?.seats ?? ''}:${org?.usage?.lecturers ?? ''}:${org?.usage?.staff ?? ''}:${org?.shifts ? 's' : ''}:${org?.phoneCheck ?? ''}:${org?.tags?.includes('pay-test') ? 't' : ''}`)
        // Once per visit, where the plan has a size: have the server count what is in use.
        if (!counted.current && org && ((org.plan ?? 'early') !== 'early' || (org.purpose ?? 'education') === 'education')) {
          counted.current = true
          void refreshUsage()
        }
      }),
    [organisationId, uid],
  )
  if (!purpose) return <PageLoader />
  // Paused by the owner of Dobry (unpaid, or on request): nothing is deleted, nothing can be used.
  if (suspended) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-xl font-semibold">{t('This account is paused')}</h1>
        <p className="mt-2 text-muted">{t('Your organisation’s Dobry account has been paused. All your records are kept safe. Please contact Dobry to restore it.')}</p>
        <Button className="mt-6" variant="secondary" onClick={() => signOut()}>
          {t('Log out')}
        </Button>
      </div>
    )
  }
  return <div key={`${purpose}:${selling ? 'sell' : 'free'}`}>{children}</div>
}

function RequireAuth({ admin = false }: { admin?: boolean }) {
  const { loading, user, profile } = useAuth()
  const location = useLocation()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!profile) return <Navigate to="/signup" replace />
  if (profile.status !== 'active') {
    return (
      <div className="mx-auto max-w-sm px-6 py-24 text-center">
        <h1 className="text-xl font-semibold">{t('Account disabled')}</h1>
        <p className="mt-2 text-muted">{t("Your organisation's admin has disabled this account.")}</p>
        <Button className="mt-6" variant="secondary" onClick={() => signOut()}>
          {t('Log out')}
        </Button>
      </div>
    )
  }
  if (admin && profile.role !== 'admin') return <Navigate to="/app" replace />
  return (
    <PurposeGate organisationId={profile.organisationId} uid={profile.id}>
      <MySessionsProvider>
        <Outlet />
      </MySessionsProvider>
    </PurposeGate>
  )
}

/** Everything that needs a signed-in lecturer or admin. */
export default function Staff() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route element={<RequireAuth />}>
          {/* Full screen, for a tablet at the door: no menu around it. */}
          <Route path="/app/door" element={<Kiosk />} />
          <Route path="/app/setup" element={<Setup />} />
          <Route element={<AppShell />}>
            <Route path="/app" element={<Dashboard />} />
            <Route path="/app/new" element={<NewSession />} />
            <Route path="/app/timetable" element={<Timetable />} />
            <Route path="/app/timetable/:classId" element={<NewSession />} />
            <Route path="/app/timetable/:classId/students" element={<Roster />} />
            <Route path="/app/timetable/:classId/report" element={<Report />} />
            <Route path="/app/account" element={<Account />} />
            <Route path="/app/calendar" element={<Calendar />} />
            <Route path="/app/students" element={<Students />} />
            <Route path="/app/reports" element={<Reports />} />
            <Route path="/app/reports/monthly" element={<Payroll />} />
            <Route path="/app/pay" element={<Payroll key="pay" payFirst />} />
            <Route path="/app/plan" element={<Schedule />} />
            <Route path="/app/reports/subject/:subjectKey" element={<SubjectReport />} />
            <Route path="/app/history" element={<History />} />
            <Route path="/app/session/:id" element={<SessionDetail />} />
          </Route>
        </Route>
        <Route element={<RequireAuth admin />}>
          <Route element={<AppShell />}>
            <Route path="/admin" element={<Admin />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
