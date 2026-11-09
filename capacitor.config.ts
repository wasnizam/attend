import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The Dobry app for iPhone and Android. It opens the live app at dobry.app, so every update
 * to the website reaches the app at once, with nothing to resubmit. The native parts (status bar,
 * splash screen, haptics, and later notifications) are added around it.
 */
const config: CapacitorConfig = {
  appId: 'app.dobry',
  appName: 'Dobry',
  webDir: 'dist',
  server: {
    // CAP_SERVER_URL points a test build at a computer's own copy (e.g. http://localhost:5173/app).
    url: process.env.CAP_SERVER_URL || 'https://dobry.app/app',
    // Only Dobry's own pages open inside the app; anything else opens in Safari.
    allowNavigation: ['dobry.app', 'www.dobry.app', ...(process.env.CAP_SERVER_URL ? ['localhost'] : [])],
  },
  ios: {
    contentInset: 'never',
    backgroundColor: '#16123f',
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    backgroundColor: '#16123f',
  },
  plugins: {
    // Google and Apple sign-in on the phone itself (Google does not allow its web sign-in inside
    // apps). The phone only proves who the person is; the sign-in into Dobry itself is the same
    // as on the website, so it is one account everywhere.
    FirebaseAuthentication: { skipNativeAuth: true, providers: ['google.com', 'apple.com'] },
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#16123f', showSpinner: false },
    StatusBar: { overlaysWebView: true, style: 'DARK' },
  },
  // Only the Google sign-in SDK is linked in; the plugin's Facebook SDK is left out.
  experimental: {
    ios: { spm: { swiftToolsVersion: '6.1', packageTraits: { '@capacitor-firebase/authentication': ['Google'] } } },
  },
}

export default config
