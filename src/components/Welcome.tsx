import { useEffect } from 'react'
import { t } from '../lib/i18n'
import { statusBarFor } from '../lib/native'
import { markWelcomed } from '../lib/welcome'
import { LanguageSwitch } from './LanguageSwitch'
import { ScanIcon, useScan } from './ScanToCheckIn'

/**
 * The phone app's first screen, shown once. Most people who install Dobry only need to check in
 * (no account); the rest run classes or a workplace and need to sign in. One tap sends each on
 * their way.
 */
export function Welcome({ onSignIn }: { onSignIn: () => void }) {
  useEffect(() => statusBarFor('dark'), [])
  const { start, busy, error, primer } = useScan()
  const choice = 'flex w-full items-center gap-4 rounded-2xl p-4 text-left transition active:scale-[0.99] disabled:opacity-60'
  return (
    <div className="relative isolate min-h-dvh overflow-hidden bg-night text-white">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(40rem_25rem_at_90%_0%,rgb(255_200_61/0.18),transparent_60%),radial-gradient(40rem_30rem_at_0%_100%,rgb(99_102_241/0.45),transparent_60%)]" />
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col px-5" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 3rem)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <img src="/favicon.svg" alt="" className="size-20 rounded-[22px] shadow-[0_20px_50px_-15px_rgb(0_0_0/0.6)]" />
          <h1 className="mt-6 font-display text-4xl font-bold tracking-tight">Dobry</h1>
          <p className="mt-2 text-lg text-indigo-100/90">{t('Attendance in seconds, with a QR code.')}</p>
        </div>

        <p className="mb-3 text-center text-sm font-semibold text-indigo-100/80">{t('How will you use Dobry?')}</p>
        <div className="space-y-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              markWelcomed()
              start()
            }}
            className={`${choice} bg-sun text-night`}
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-night/10">
              <ScanIcon className="size-7" />
            </span>
            <span>
              <span className="block font-semibold">{t('I’m checking in')}</span>
              <span className="block text-sm text-night/75">{t('Student, participant or staff. No account needed.')}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              markWelcomed()
              onSignIn()
            }}
            className={`${choice} bg-white/10 ring-1 ring-white/20`}
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 5h16v11H4zM9 20h6M12 16v4M8 9h5M8 12h8" />
              </svg>
            </span>
            <span>
              <span className="block font-semibold">{t('I run classes or manage staff')}</span>
              <span className="block text-sm text-indigo-100/80">{t('Lecturers, trainers and managers: sign in or create an account.')}</span>
            </span>
          </button>
        </div>
        {error && <p className="mt-3 text-center text-sm text-amber-200">{error}</p>}
        <LanguageSwitch className="mx-auto mt-6 !bg-white/10 [&_[aria-pressed=false]]:!text-white/70" />
      </div>
      {primer}
    </div>
  )
}
