import { useState } from 'react'
import { signInWithApple, signInWithGoogle } from '../data/account'
import { t } from '../lib/i18n'
import { nativePlatform } from '../lib/native'
import { Spinner, friendlyError } from './ui'

/**
 * "Continue with Google", followed by the divider that introduces the email form. In the iPhone
 * app, "Sign in with Apple" sits next to it, as Apple requires wherever Google sign-in is offered.
 */
export function GoogleButton({ onError }: { onError: (message: string) => void }) {
  const [busy, setBusy] = useState<'' | 'google' | 'apple'>('')
  const apple = nativePlatform() === 'ios'
  const go = async (which: 'google' | 'apple') => {
    setBusy(which)
    onError('')
    try {
      await (which === 'apple' ? signInWithApple() : signInWithGoogle())
    } catch (e) {
      // Closing the sign-in sheet is not an error worth showing.
      const message = String((e as { message?: string })?.message ?? '')
      if (!/cancel/i.test(message)) onError(friendlyError(e))
      setBusy('')
    }
  }
  return (
    <>
      {apple && (
        <button
          type="button"
          onClick={() => go('apple')}
          disabled={busy !== ''}
          className="mb-2.5 flex h-11 w-full items-center justify-center gap-2.5 rounded-lg bg-black text-sm font-medium text-white transition hover:bg-black/85 disabled:opacity-60"
        >
          {busy === 'apple' ? (
            <Spinner small />
          ) : (
            <svg viewBox="0 0 24 24" className="size-[18px]" fill="currentColor" aria-hidden>
              <path d="M16.37 12.6c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.62-1.7-3.19-1.72-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.19-1.54 2.67-.39 6.63 1.1 8.8.73 1.06 1.6 2.25 2.74 2.2 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.08 2.65-2.14.84-1.23 1.18-2.42 1.2-2.48-.03-.01-2.3-.88-2.32-3.5ZM14.2 6.13c.6-.73 1.01-1.75.9-2.76-.87.03-1.92.58-2.54 1.31-.56.64-1.05 1.67-.92 2.66.97.08 1.96-.49 2.56-1.21Z" />
            </svg>
          )}
          {t('Sign in with Apple')}
        </button>
      )}
      <button
        type="button"
        onClick={() => go('google')}
        disabled={busy !== ''}
        className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-line bg-white text-sm font-medium shadow-xs transition hover:bg-canvas disabled:opacity-60"
      >
        {busy === 'google' ? (
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
