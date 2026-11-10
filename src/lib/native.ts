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
  if (nativePlatform() !== 'android') return
  import('@capacitor/app')
    .then(({ App }) => App.addListener('backButton', ({ canGoBack }) => (canGoBack ? window.history.back() : App.exitApp())))
    .catch(() => {})
}

/** A short "done" buzz on the phone, for a check-in that went through. Nothing in a browser. */
export function buzzSuccess() {
  if (!inNativeApp()) return
  import('@capacitor/haptics')
    .then(({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Success }))
    .catch(() => {})
}
