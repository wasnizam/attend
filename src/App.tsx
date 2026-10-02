import { Suspense, lazy } from 'react'
import { Outlet, Route, Routes } from 'react-router-dom'
import { PageLoader } from './components/ui'
import { isConfigured } from './lib/firebase'
import { useLang } from './lib/i18n'
import { Landing } from './pages/Landing'

// The participant check-in page and the lecturer app are separate bundles, so a
// student scanning the QR downloads only what the check-in form needs.
const Attend = lazy(() => import('./pages/Attend'))
const Staff = lazy(() => import('./Staff'))

function SetupNeeded() {
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Connect Firebase to continue</h1>
      <p className="mt-3 text-muted">
        Copy <code>.env.example</code> to <code>.env.local</code> and fill in your Firebase web app config, or run
        with the local emulators using <code>npm run dev:emulator</code>.
      </p>
    </div>
  )
}

function NeedsFirebase() {
  return isConfigured ? <Outlet /> : <SetupNeeded />
}

export function App() {
  // Changing language re-mounts every screen, so all text is re-read in the new language.
  const lang = useLang()
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes key={lang}>
        <Route path="/" element={<Landing />} />
        {/* One page, three doors: each group has its own address to share. */}
        <Route path="/lecturers" element={<Landing show="lecturers" />} />
        <Route path="/trainers" element={<Landing show="trainers" />} />
        <Route path="/workplace" element={<Landing show="workplace" />} />
        <Route element={<NeedsFirebase />}>
          <Route path="/session/:token" element={<Attend />} />
          <Route path="/*" element={<Staff />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
