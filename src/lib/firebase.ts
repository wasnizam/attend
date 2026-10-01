import { initializeApp } from 'firebase/app'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

export const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || (useEmulators ? 'demo-key' : ''),
  // Google sign-in needs an auth domain even when it is the emulator answering.
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || (useEmulators ? 'demo-attendance.firebaseapp.com' : undefined),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || (useEmulators ? 'demo-attendance' : ''),
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

/** False when no Firebase project has been configured yet (see .env.example). */
export const isConfigured = Boolean(config.apiKey && config.projectId)

export const app = initializeApp(isConfigured ? config : { ...config, apiKey: 'unset', projectId: 'unset' })
export const db = getFirestore(app)

// Emulators are reached on the same host the page was loaded from, so a phone on
// the same Wi-Fi can scan the QR during local development.
export const emulatorHost = typeof window === 'undefined' ? '127.0.0.1' : window.location.hostname

if (useEmulators) connectFirestoreEmulator(db, emulatorHost, 8080)
