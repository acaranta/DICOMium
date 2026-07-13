import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError, type User } from './api'

interface AuthState {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
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
      setUser(await api.post<User>('/api/auth/login', { email, password }))
    },
    register: async (email, password) => {
      setUser(await api.post<User>('/api/auth/register', { email, password }))
    },
    logout: async () => {
      await api.post('/api/auth/logout')
      setUser(null)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
