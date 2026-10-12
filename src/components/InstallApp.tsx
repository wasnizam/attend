import { useState } from 'react'
import { install, useInstall } from '../lib/install'
import { t } from '../lib/i18n'
import { Button } from './ui'

const KEY = 'attend.install.dismissed'

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** The iPhone's Share button, as it looks in Safari. */
const ShareIcon = () => (
  <svg viewBox="0 0 24 24" className="mx-0.5 inline size-4 -translate-y-px" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 15V3m0 0L8 7m4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </svg>
)

/** How to do it on this device, in one or two short steps. */
function Steps({ way }: { way: 'ios' | 'menu' }) {
  return way === 'ios' ? (
    <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
      <li>
        {t('Tap the Share button')} <ShareIcon /> {t('at the bottom of Safari.')}
      </li>
      <li>{t('Choose “Add to Home Screen”, then tap Add.')}</li>
    </ol>
  ) : (
    <p className="mt-2 text-sm">{t('Open your browser’s menu (⋮ or ⋯) and choose “Install app” or “Add to Home screen”.')}</p>
  )
}

/**
 * Invites the person to put Dobry on their phone or computer as an app, so they stop typing the
 * address and logging in. As a banner it can be closed, and stays closed on this device; on the
 * Account page (`always`) it is there whenever they want it. Never shown inside the app itself.
 */
export function InstallApp({ always = false }: { always?: boolean }) {
  const { installed, way } = useInstall()
  const [hidden, setHidden] = useState(wasDismissed)
  const [showSteps, setShowSteps] = useState(false)
  const [busy, setBusy] = useState(false)
  if (installed) return always ? <p className="text-sm text-muted">{t('Dobry is installed on this device. You are using the app now.')}</p> : null
  if (!always && hidden) return null

  const close = () => {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      // Private browsing: the banner simply comes back next time.
    }
    setHidden(true)
  }
  const go = async () => {
    if (way !== 'button') return setShowSteps(true)
    setBusy(true)
    await install().catch(() => false)
    setBusy(false)
  }

  if (always) {
    return (
      <div>
        <p className="text-sm text-muted">{t('Put Dobry on your home screen or desktop. It opens like any app and keeps you logged in.')}</p>
        {way === 'button' ? (
          <Button className="mt-3" busy={busy} onClick={go}>{t('Install Dobry')}</Button>
        ) : (
          <Steps way={way} />
        )}
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-night px-4 py-3 text-white shadow-card print:hidden">
      <img src="/favicon.svg" alt="" className="size-9 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 basis-48">
        <p className="font-semibold">{t('Get the Dobry app')}</p>
        <p className="text-sm text-indigo-100/80">{t('One tap to open, and no logging in each time.')}</p>
        {showSteps && way !== 'button' && <div className="text-indigo-100/90"><Steps way={way} /></div>}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {!(showSteps && way !== 'button') && (
          <Button variant="sun" busy={busy} onClick={go}>{way === 'button' ? t('Install') : t('Show me how')}</Button>
        )}
        <button type="button" onClick={close} aria-label={t('Not now')} className="rounded-lg px-2 py-1.5 text-lg leading-none text-white/60 hover:bg-white/10 hover:text-white">×</button>
      </div>
    </div>
  )
}
