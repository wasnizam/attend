import { type User, onAuthStateChanged } from 'firebase/auth'
import { type ReactNode, createContext, useContext, useEffect, useState } from 'react'
import { subscribeProfile } from '../data/account'
import { auth } from '../lib/auth'
import type { UserProfile } from '../lib/types'

interface AuthState {
  /** True until we know both the auth state and (if signed in) the profile. */
  loading: boolean
  user: User | null
  /** null while signed in means the account exists but setup was never finished. */
  profile: UserProfile | null
}

const AuthContext = createContext<AuthState>({ loading: true, user: null, profile: null })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ loading: true, user: null, profile: null })

  useEffect(() => {
    let stopProfile = () => {}
    const stopAuth = onAuthStateChanged(auth, (user) => {
      stopProfile()
      if (!user) {
        setState({ loading: false, user: null, profile: null })
        return
      }
      setState((s) => ({ ...s, loading: true, user }))
      stopProfile = subscribeProfile(
        user.uid,
        (profile) => setState({ loading: false, user, profile }),
        () => setState({ loading: false, user, profile: null }),
      )
    })
    return () => {
      stopProfile()
      stopAuth()
    }
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

/** For screens behind RequireAuth, where a profile is guaranteed. */
export function useProfile(): UserProfile {
  const { profile } = useAuth()
  if (!profile) throw new Error('useProfile used outside an authenticated route')
  return profile
}
