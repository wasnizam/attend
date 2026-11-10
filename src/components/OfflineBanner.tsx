import { useEffect, useState } from 'react'
import { t } from '../lib/i18n'

/**
 * A strip at the top while the phone or computer has no internet. What is on the screen stays,
 * and Dobry picks up again by itself once the connection is back.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false)
  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  if (!offline) return null
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[100] bg-night px-4 pb-2 text-center text-sm font-medium text-white shadow-lg" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}>
      {t('No internet connection. Dobry carries on once you are back online.')}
    </div>
  )
}
