import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { api, type AuthConfig } from '../lib/api'
import { useAuth } from '../lib/auth'
import { IconSpinner } from '../components/ui/Icons'
import AuthLayout from '../components/layout/AuthLayout'

export default function Register() {
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [config, setConfig] = useState<AuthConfig | null>(null)

  useEffect(() => {
    api.get<AuthConfig>('/api/auth/config').then(setConfig).catch(() => {})
  }, [])

  if (user) return <Navigate to="/" replace />

  const minLength = config?.min_password_length ?? 12
  const isFirstUser = config?.has_users === false
  const closed = config && !config.registration_enabled && config.has_users

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('The passwords do not match')
      return
    }
    if (password.length < minLength) {
      setError(`Use at least ${minLength} characters`)
      return
    }

    setBusy(true)
    try {
      await register(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setBusy(false)
    }
  }

  if (closed) {
    return (
      <AuthLayout title="Registration is closed">
        <p className="text-xs leading-relaxed text-ink-dim">
          This instance is not accepting new accounts. Ask an administrator to create one
          for you.
        </p>
        <Link to="/login" className="btn mt-5 w-full justify-center py-2">
          Back to sign in
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Create an account"
      subtitle={
        isFirstUser
          ? 'This is the first account on this instance — it will be the administrator.'
          : undefined
      }
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
            autoComplete="new-password"
            required
          />
          <p className="mt-1 text-2xs text-ink-faint">
            At least {minLength} characters.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="confirm">Confirm password</label>
          <input
            id="confirm"
            type="password"
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
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
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-ink-dim">
        Already registered?{' '}
        <Link to="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
