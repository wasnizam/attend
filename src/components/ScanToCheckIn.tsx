import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { t } from '../lib/i18n'
import { inNativeApp } from '../lib/native'
import { scanCheckIn } from '../lib/scan'

/**
 * Inside the phone app only: students and staff check in with the app's own camera scanner. They
 * need no account, so it sits on the sign-in screen, above everything else.
 */
export function ScanToCheckIn() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (!inNativeApp()) return null
  const scan = async () => {
    setError('')
    setBusy(true)
    try {
      const path = await scanCheckIn()
      if (path) navigate(path)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mb-4 rounded-2xl bg-white/10 p-4 text-center text-white ring-1 ring-white/15">
      <p className="text-sm font-semibold">{t('Checking in to a class or work?')}</p>
      <button
        type="button"
        onClick={scan}
        disabled={busy}
        className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sun font-semibold text-night disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10" />
        </svg>
        {t('Scan QR to check in')}
      </button>
      <p className="mt-2 text-xs text-indigo-100/80">{t('No account needed. Your ID is remembered after the first time.')}</p>
      {error && <p className="mt-2 text-sm text-amber-200">{error}</p>}
    </div>
  )
}
