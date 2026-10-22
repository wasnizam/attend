import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The Dobry app for iPhone (and later Android). It opens the live app at dobry.app, so every update
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
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#16123f', showSpinner: false },
    StatusBar: { overlaysWebView: true, style: 'DARK' },
  },
}

export default config
