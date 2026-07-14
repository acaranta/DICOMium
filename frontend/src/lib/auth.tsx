import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError, type LoginResult, type User } from './api'
import { applyUserLanguage } from './i18n'

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

  /** Adopt a user, and switch to the language they chose.
   *
   * A null language means "follow the browser" and is deliberately left alone — forcing English
   * here would override the browser preference of every user who never opened the settings. */
  const adopt = (u: User | null) => {
    setUser(u)
    applyUserLanguage(u?.language)
  }

  useEffect(() => {
    // A 401 here is the normal "not logged in" case, not an error worth surfacing.
    api
      .get<User>('/api/auth/me')
      .then(adopt)
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
      if (result.user) adopt(result.user)
      return result
    },

    verifyMfa: async (code) => {
      const result = await api.post<LoginResult>('/api/auth/login/mfa', { code })
      if (result.user) adopt(result.user)
      return result
    },

    register: async (email, password) => {
      adopt(await api.post<User>('/api/auth/register', { email, password }))
    },

    logout: async () => {
      await api.post('/api/auth/logout')
      // The language is NOT reset on sign-out. It is already in localStorage, and snapping the
      // login page back to the browser's language the instant someone signs out would be
      // jarring — they are usually about to sign back in.
      setUser(null)
    },

    adopt,

    refresh: async () => {
      adopt(await api.get<User>('/api/auth/me'))
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
