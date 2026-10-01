import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { app, emulatorHost, useEmulators } from './firebase'

// Kept apart from firebase.ts so the participant check-in page never loads Auth.
export const auth = getAuth(app)

if (useEmulators) connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true })
