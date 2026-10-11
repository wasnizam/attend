import { useEffect, useState } from 'react'

/**
 * Putting Dobry on the home screen or desktop as an app: no address to type, and it stays
 * signed in. Chrome, Edge and Android offer it through an event we keep until the person asks;
 * on an iPhone or iPad it is done by hand from the Share menu, so there we can only show how.
 */
interface InstallEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let offer: InstallEvent | null = null
let done = false
const listeners = new Set<() => void>()
const tell = () => listeners.forEach((f) => f())

/** Called once when the page loads, before the browser's offer can be missed. */
export function watchInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Keep the browser's own small banner away; Dobry shows its own button.
    e.preventDefault()
    offer = e as InstallEvent
    tell()
  })
  window.addEventListener('appinstalled', () => {
    offer = null
    done = true
    tell()
  })
}

/** Already opened as an app (from the home screen or desktop), not in a browser tab. */
export const isInstalled = () =>
  window.matchMedia?.('(display-mode: standalone)').matches === true || (navigator as { standalone?: boolean }).standalone === true

export type InstallWay = 'button' | 'ios' | 'menu'

/** How this device installs it: one tap, the iPhone's Share menu, or the browser's own menu. */
export function installWay(): InstallWay {
  if (offer) return 'button'
  const ua = navigator.userAgent
  // An iPad says it is a Mac, but has a touch screen.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  return ios ? 'ios' : 'menu'
}

/** Asks the browser to install. True when the person agreed. */
export async function install(): Promise<boolean> {
  if (!offer) return false
  const e = offer
  await e.prompt()
  const { outcome } = await e.userChoice
  // The browser gives each offer once.
  offer = null
  tell()
  return outcome === 'accepted'
}

/** Live: whether it is installed, and how this device would install it. */
export function useInstall(): { installed: boolean; way: InstallWay } {
  const [, redraw] = useState(0)
  useEffect(() => {
    const f = () => redraw((n) => n + 1)
    listeners.add(f)
    return () => {
      listeners.delete(f)
    }
  }, [])
  return { installed: done || isInstalled(), way: installWay() }
}
