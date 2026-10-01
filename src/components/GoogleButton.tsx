import { useState } from 'react'
import { signInWithGoogle } from '../data/account'
import { t } from '../lib/i18n'
import { Spinner, friendlyError } from './ui'

/** "Continue with Google", followed by the divider that introduces the email form. */
export function GoogleButton({ onError }: { onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    onError('')
    try {
      await signInWithGoogle()
    } catch (e) {
      onError(friendlyError(e))
      setBusy(false)
    }
  }
  return (
    <>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-line bg-white text-sm font-medium shadow-xs transition hover:bg-canvas disabled:opacity-60"
      >
        {busy ? (
          <Spinner small />
        ) : (
          <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.500-4.800 7.200l7.600 5.900c4.400-4.100 7-10.100 7-17.600z" />
            <path fill="#FBBC05" d="M10.500 28.600c-.5-1.400-.8-3-.8-4.600s.3-3.200.8-4.600l-7.900-6.200C1 16.500 0 20.100 0 24s1 7.500 2.600 10.800l7.900-6.200z" />
            <path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.600-5.900c-2.100 1.400-4.900 2.300-8.300 2.300-6.300 0-11.600-4.100-13.500-9.900l-7.900 6.200C6.500 42.600 14.600 48 24 48z" />
          </svg>
        )}
        {t('Continue with Google')}
      </button>
      <p className="mt-4 flex items-center gap-3 text-xs text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
        {t('or with email')}
      </p>
    </>
  )
}
