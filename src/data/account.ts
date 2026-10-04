import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  reauthenticateWithCredential,
  sendEmailVerification,
  signInWithPopup,
  updatePassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
} from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { auth } from '../lib/auth'
import { db } from '../lib/firebase'
import { randomToken } from '../lib/format'
import { PAYMENTS_OPEN } from '../lib/plan'
import type { Purpose } from '../lib/purpose'
import type { Organisation, Role, UserProfile, UserStatus } from '../lib/types'

export const signIn = (email: string, password: string) =>
  signInWithEmailAndPassword(auth, email.trim(), password)

export const signOut = () => fbSignOut(auth)

export const resetPassword = (email: string) => sendPasswordResetEmail(auth, email.trim())

export async function createAccount(name: string, email: string, password: string) {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
  await updateProfile(cred.user, { displayName: name.trim() })
  // Best effort: a failed verification email must not block sign-up.
  sendEmailVerification(cred.user).catch(() => {})
  return cred.user
}

/** Google sign-in. A first-time Google user lands on "Finish setting up" to pick an organisation. */
export const signInWithGoogle = () => signInWithPopup(auth, new GoogleAuthProvider())

export async function resendVerification() {
  if (auth.currentUser) await sendEmailVerification(auth.currentUser)
}

export async function changeName(name: string) {
  const user = auth.currentUser
  if (!user) throw new Error('Not signed in')
  await updateDoc(doc(db, 'users', user.uid), { name: name.trim() })
  await updateProfile(user, { displayName: name.trim() })
}

/** Firebase needs a fresh login before a password change, so the current one is asked for. */
export async function changePassword(current: string, next: string) {
  const user = auth.currentUser
  if (!user?.email) throw new Error('Not signed in')
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current))
  await updatePassword(user, next)
}

/** Live view of the organisation, so a change of purpose reaches every member's screen. */
export function subscribeOrganisation(id: string, onData: (org: Organisation | null) => void) {
  return onSnapshot(
    doc(db, 'organisations', id),
    (snap) => onData(snap.exists() ? ({ id: snap.id, ...snap.data() } as Organisation) : null),
    () => onData(null),
  )
}

/** Workplace: turn the advanced shift features on or off for everyone in the organisation. */
/** Workplace: flag, or refuse, a clock-in from a phone that is not the person's own. */
export const setPhoneCheckFor = (id: string, value: 'flag' | 'block') => updateDoc(doc(db, 'organisations', id), { phoneCheck: value })

export const setShifts = (id: string, on: boolean) => updateDoc(doc(db, 'organisations', id), { shifts: on })

export async function renameOrganisation(org: Organisation, name: string) {
  await updateDoc(doc(db, 'organisations', org.id), { name: name.trim() })
  // Keeps the name shown to people joining with the invite link in step.
  await updateDoc(doc(db, 'invites', org.inviteCode), { organisationName: name.trim() }).catch(() => {})
}

/** Creates a new organisation and makes the signed-in user its admin. */
export async function createOrganisationProfile(name: string, organisationName: string, purpose: Purpose = 'education') {
  const user = auth.currentUser
  if (!user) throw new Error('Not signed in')
  const orgRef = doc(collection(db, 'organisations'))
  const inviteCode = randomToken(8)
  await setDoc(orgRef, {
    name: organisationName.trim(),
    ownerId: user.uid,
    purpose,
    // Before payment opens everyone is on early access; afterwards a new organisation starts a trial.
    ...(PAYMENTS_OPEN ? { plan: 'trial', trialStarted: serverTimestamp() } : { plan: 'early' }),
    inviteCode,
    createdAt: serverTimestamp(),
  })
  await setDoc(doc(db, 'users', user.uid), {
    name: name.trim(),
    email: user.email,
    role: 'admin',
    status: 'active',
    organisationId: orgRef.id,
    createdAt: serverTimestamp(),
  })
  await setDoc(doc(db, 'invites', inviteCode), {
    organisationId: orgRef.id,
    organisationName: organisationName.trim(),
    createdAt: serverTimestamp(),
  })
}

export async function lookupInvite(code: string): Promise<{ organisationId: string; organisationName: string } | null> {
  const clean = code.trim().toUpperCase()
  if (!/^[A-Z0-9]{4,12}$/.test(clean)) return null
  const snap = await getDoc(doc(db, 'invites', clean))
  return snap.exists() ? (snap.data() as { organisationId: string; organisationName: string }) : null
}

/** Joins an existing organisation as a lecturer using its invite code. */
export async function joinOrganisationProfile(name: string, code: string) {
  const user = auth.currentUser
  if (!user) throw new Error('Not signed in')
  const inviteCode = code.trim().toUpperCase()
  const invite = await lookupInvite(inviteCode)
  if (!invite) throw new Error('That invite code is not valid.')
  await setDoc(doc(db, 'users', user.uid), {
    name: name.trim(),
    email: user.email,
    role: 'lecturer',
    status: 'active',
    organisationId: invite.organisationId,
    inviteCode,
    createdAt: serverTimestamp(),
  })
}

export function subscribeProfile(
  uid: string,
  onData: (profile: UserProfile | null) => void,
  onError: (e: Error) => void,
) {
  return onSnapshot(
    doc(db, 'users', uid),
    { includeMetadataChanges: true },
    (snap) => {
      // During sign-up the profile shows up locally before the server has it. Wait for
      // the server: the security rules read this document to authorise everything else.
      if (snap.metadata.hasPendingWrites) return
      onData(snap.exists() ? ({ id: snap.id, ...snap.data() } as UserProfile) : null)
    },
    onError,
  )
}

export async function getOrganisation(id: string): Promise<Organisation | null> {
  const snap = await getDoc(doc(db, 'organisations', id))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Organisation) : null
}

// ---- admin: user management ----

export function subscribeOrgUsers(
  organisationId: string,
  onData: (users: UserProfile[]) => void,
  onError: (e: Error) => void,
) {
  return onSnapshot(
    query(collection(db, 'users'), where('organisationId', '==', organisationId)),
    (snap) =>
      onData(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as UserProfile)
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    onError,
  )
}

export const setUserRole = (userId: string, role: Role) => updateDoc(doc(db, 'users', userId), { role })

export const setUserStatus = (userId: string, status: UserStatus) =>
  updateDoc(doc(db, 'users', userId), { status })
