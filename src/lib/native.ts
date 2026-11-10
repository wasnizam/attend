/**
 * Whether Dobry is running inside its iPhone or Android app rather than a browser. The app opens
 * the same pages as the website; a few things differ inside it (no Google sign-in, no "install the
 * app" banner, the phone's status bar follows the screen's colour).
 */
type Bridge = { isNativePlatform?: () => boolean; getPlatform?: () => string }
const bridge = (): Bridge | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as { Capacitor?: Bridge }).Capacitor)

export const inNativeApp = () => Boolean(bridge()?.isNativePlatform?.())
export const nativePlatform = () => (inNativeApp() ? bridge()?.getPlatform?.() ?? '' : '')

/** Light text on the night-blue screens (sign-in, check-in), dark text on the app's white screens. */
export function statusBarFor(background: 'dark' | 'light') {
  if (!inNativeApp()) return
  import('@capacitor/status-bar')
    .then(({ StatusBar, Style }) => StatusBar.setStyle({ style: background === 'dark' ? Style.Dark : Style.Light }))
    .catch(() => {})
}

/**
 * Android's back button: back one screen, like the browser's back; on the first screen it leaves
 * the app, as Android people expect.
 */
export function startNativeApp() {
  if (!inNativeApp()) return
  keepLinksInApp()
  if (nativePlatform() !== 'android') return
  import('@capacitor/app')
    .then(({ App }) => App.addListener('backButton', ({ canGoBack }) => (canGoBack ? window.history.back() : App.exitApp())))
    .catch(() => {})
}

const OWN_HOSTS = ['dobry.app', 'www.dobry.app']
/** Class meeting links: these belong in the Zoom, Teams, Meet or Webex app, so the phone opens them itself. */
const MEETING = /(^|\.)(zoom\.us|zoom\.com|teams\.microsoft\.com|teams\.live\.com|meet\.google\.com|webex\.com)$/i

/** Moves the app to one of its own pages without reloading it (the router follows the address). */
function goInApp(path: string) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/**
 * Where a link goes inside the phone app. Left alone, a "new tab" link or another website would
 * throw the person out to the phone's browser. Instead: Dobry's own pages stay in the app;
 * WhatsApp links open the share sheet with the message; class meeting links open their own app;
 * any other website opens in a browser sheet over Dobry, with Done to come back.
 * Returns true when it took care of the link.
 */
export function routeLink(href: string, newTab: boolean): boolean {
  let url: URL
  try {
    url = new URL(href, window.location.href)
  } catch {
    return false
  }
  if (!/^https?:$/.test(url.protocol)) return false // mailto:, tel: and the like: the phone handles them.
  if (url.host === window.location.host || OWN_HOSTS.includes(url.host)) {
    if (!newTab && url.host === window.location.host) return false
    goInApp(url.pathname + url.search + url.hash)
    return true
  }
  if (url.host === 'wa.me' || url.host === 'api.whatsapp.com') {
    const text = url.searchParams.get('text') ?? ''
    import('@capacitor/share').then(({ Share }) => Share.share({ text })).catch(() => {})
    return true
  }
  if (MEETING.test(url.hostname)) return false
  import('@capacitor/browser').then(({ Browser }) => Browser.open({ url: url.href, presentationStyle: 'popover' })).catch(() => {})
  return true
}

function keepLinksInApp() {
  document.addEventListener(
    'click',
    (e) => {
      if (e.defaultPrevented || e.button !== 0) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.hasAttribute('download')) return
      const href = a.getAttribute('href') ?? ''
      if (href.startsWith('#')) return
      if (routeLink(a.href, a.target === '_blank')) e.preventDefault()
    },
    true,
  )
  // Code that opens a new window (rather than a link) gets the same treatment.
  const open = window.open.bind(window)
  window.open = (url?: string | URL, target?: string, features?: string) => {
    if (url && routeLink(String(url), true)) return null
    return open(url, target, features)
  }
}

/** A short "done" buzz on the phone, for a check-in that went through. Nothing in a browser. */
export function buzzSuccess() {
  if (!inNativeApp()) return
  import('@capacitor/haptics')
    .then(({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Success }))
    .catch(() => {})
}
