import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { api, type AuthConfig } from '../lib/api'
import { useAuth } from '../lib/auth'
import { IconSpinner } from '../components/ui/Icons'
import AuthLayout from '../components/layout/AuthLayout'

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [config, setConfig] = useState<AuthConfig | null>(null)

  useEffect(() => {
    api.get<AuthConfig>('/api/auth/config').then(setConfig).catch(() => {})
  }, [])

  if (user) return <Navigate to="/" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  // A brand-new deployment has no users yet: send the first visitor straight to the
  // account they need to create, rather than making them fail a login first.
  const showRegister = config?.registration_enabled || config?.has_users === false

  return (
    <AuthLayout
      title="Sign in"
      subtitle={config?.has_users === false ? 'No accounts yet — the first one becomes the administrator.' : undefined}
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
            autoFocus
          />
        </div>

        <div>
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        {error && (
          <p className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary w-full py-2" disabled={busy}>
          {busy ? <IconSpinner /> : null}
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {showRegister && (
        <p className="mt-6 text-center text-xs text-ink-dim">
          No account?{' '}
          <Link to="/register" className="text-accent hover:underline">
            Create one
          </Link>
        </p>
      )}
    </AuthLayout>
  )
}
