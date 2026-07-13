import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError, type LoginResult, type User } from './api'

interface AuthState {
  user: User | null
  loading: boolean
  /** Resolves to the raw result: the caller must handle `mfa_required`. */
  login: (email: string, password: string) => Promise<LoginResult>
  verifyMfa: (code: string) => Promise<LoginResult>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /** Adopt a user after a passkey sign-in, which bypasses the password entirely. */
  adopt: (user: User) => void
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // A 401 here is the normal "not logged in" case, not an error worth surfacing.
    api
      .get<User>('/api/auth/me')
      .then(setUser)
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) console.error(err)
      })
      .finally(() => setLoading(false))
  }, [])

  const value: AuthState = {
    user,
    loading,

    login: async (email, password) => {
      const result = await api.post<LoginResult>('/api/auth/login', { email, password })
      // Only adopt the user when the sign-in actually completed. When MFA is owed the
      // server has issued no session, so setting a user here would show the app to
      // someone who is not yet authenticated.
      if (result.user) setUser(result.user)
      return result
    },

    verifyMfa: async (code) => {
      const result = await api.post<LoginResult>('/api/auth/login/mfa', { code })
      if (result.user) setUser(result.user)
      return result
    },

    register: async (email, password) => {
      setUser(await api.post<User>('/api/auth/register', { email, password }))
    },

    logout: async () => {
      await api.post('/api/auth/logout')
      setUser(null)
    },

    adopt: setUser,

    refresh: async () => {
      setUser(await api.get<User>('/api/auth/me'))
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
