import { browserLocalPersistence, connectAuthEmulator, getAuth, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth'
import { app, emulatorHost, useEmulators } from './firebase'
import { inNativeApp } from './native'

// Kept apart from firebase.ts so the participant check-in page never loads Auth.
// Inside the phone app, sign-in goes through the phone's own Google and Apple sign-in, so Firebase's
// pop-up helper (a hidden frame from firebaseapp.com) is left out: Android would open that frame in
// the browser. The saved sign-in is the same one, so nobody is signed out.
export const auth = inNativeApp() ? initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] }) : getAuth(app)

if (useEmulators) connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true })
