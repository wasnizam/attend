import { registerSW } from 'virtual:pwa-register'

const RELOADED = 'attend.reloadedFor'

/**
 * Keeps an installed copy of the app current. Without this, a phone can keep running an
 * old saved version that asks the server for files which no longer exist.
 */
export function keepUpToDate() {
  // With registerType 'autoUpdate', this reloads the page as soon as a new version has
  // been downloaded and taken over.
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      // An app left open on a phone for days still checks: hourly, and whenever it is
      // brought back to the front.
      const check = () => registration.update().catch(() => {})
      setInterval(check, 60 * 60 * 1000)
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
    },
  })

  // A part of the app failed to load, which means this copy is out of date. Reload once
  // to pick up the current version (once per page address, so it can never loop).
  window.addEventListener('vite:preloadError', (event) => {
    try {
      if (sessionStorage.getItem(RELOADED) === location.href) return
      sessionStorage.setItem(RELOADED, location.href)
    } catch {
      return
    }
    event.preventDefault()
    location.reload()
  })
}
