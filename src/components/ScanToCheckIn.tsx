import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { t } from '../lib/i18n'
import { inNativeApp } from '../lib/native'
import { scanCheckIn } from '../lib/scan'
import { cameraExplained, markCameraExplained } from '../lib/welcome'

/**
 * Opening the scanner, with a word about the camera the first time, before the phone itself asks
 * for permission: people who know why say yes.
 */
export function useScan() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [explaining, setExplaining] = useState(false)
  const run = async () => {
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
  const start = () => (cameraExplained() ? run() : setExplaining(true))
  const primer = explaining ? (
    <CameraPrimer
      onContinue={() => {
        markCameraExplained()
        setExplaining(false)
        void run()
      }}
      onCancel={() => setExplaining(false)}
    />
  ) : null
  return { start, busy, error, primer }
}

function CameraPrimer({ onContinue, onCancel }: { onContinue: () => void; onCancel: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="camera-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center text-ink shadow-xl" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-sun/20 text-night">
          <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        </div>
        <h2 id="camera-title" className="mt-4 text-lg font-semibold">{t('Dobry needs your camera')}</h2>
        <p className="mt-2 text-sm text-muted">{t('Only to scan the QR code on your lecturer’s or the door’s screen. Nothing is photographed or recorded.')}</p>
        <p className="mt-2 text-sm text-muted">{t('Your phone will ask next: tap Allow.')}</p>
        <button type="button" onClick={onContinue} className="mt-5 h-12 w-full rounded-xl bg-night font-semibold text-white">
          {t('Continue')}
        </button>
        <button type="button" onClick={onCancel} className="mt-2 h-10 w-full text-sm font-medium text-muted">
          {t('Not now')}
        </button>
      </div>
    </div>
  )
}

/**
 * Inside the phone app only: students and staff check in with the app's own camera scanner. They
 * need no account, so it sits on the sign-in screen, above everything else.
 */
export function ScanToCheckIn() {
  const { start, busy, error, primer } = useScan()
  if (!inNativeApp()) return null
  return (
    <div className="mb-4 rounded-2xl bg-white/10 p-4 text-center text-white ring-1 ring-white/15">
      <p className="text-sm font-semibold">{t('Checking in to a class or work?')}</p>
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sun font-semibold text-night disabled:opacity-60"
      >
        <ScanIcon />
        {t('Scan QR to check in')}
      </button>
      <p className="mt-2 text-xs text-indigo-100/80">{t('No account needed. Your ID is remembered after the first time.')}</p>
      {error && <p className="mt-2 text-sm text-amber-200">{error}</p>}
      {primer}
    </div>
  )
}

export function ScanIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10" />
    </svg>
  )
}
