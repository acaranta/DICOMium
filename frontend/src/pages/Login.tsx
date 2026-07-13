import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { api, type AuthConfig } from '../lib/api'
import { useAuth } from '../lib/auth'
import { loginWithPasskey, PasskeyCancelled, passkeysAvailable } from '../lib/passkeys'
import { IconKey, IconSpinner } from '../components/ui/Icons'
import AuthLayout from '../components/layout/AuthLayout'

type Step = 'credentials' | 'mfa'

export default function Login() {
  const { user, login, verifyMfa, adopt } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [usingRecovery, setUsingRecovery] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const [config, setConfig] = useState<AuthConfig | null>(null)

  const canUsePasskeys = passkeysAvailable()

  useEffect(() => {
    api.get<AuthConfig>('/api/auth/config').then(setConfig).catch(() => {})
  }, [])

  if (user) return <Navigate to="/" replace />

  async function submitCredentials(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await login(email, password)
      if (result.mfa_required) {
        setStep('mfa')
      } else {
        navigate('/', { replace: true })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  async function submitMfa(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await verifyMfa(code.trim())
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code was not accepted')
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  async function signInWithPasskey() {
    setError('')
    setPasskeyBusy(true)
    try {
      const result = await loginWithPasskey()
      if (result.user) {
        adopt(result.user)
        navigate('/', { replace: true })
      }
    } catch (err) {
      // Closing the OS prompt is not a failure worth shouting about.
      if (!(err instanceof PasskeyCancelled)) {
        setError(err instanceof Error ? err.message : 'That passkey did not work')
      }
    } finally {
      setPasskeyBusy(false)
    }
  }

  // ---- second factor -------------------------------------------------------
  if (step === 'mfa') {
    return (
      <AuthLayout
        title="Two-factor authentication"
        subtitle={
          usingRecovery
            ? 'Enter one of the recovery codes you saved.'
            : 'Enter the 6-digit code from your authenticator app.'
        }
      >
        <form onSubmit={submitMfa} className="space-y-4">
          <div>
            <label className="label" htmlFor="code">
              {usingRecovery ? 'Recovery code' : 'Authentication code'}
            </label>
            <input
              id="code"
              className={`input ${usingRecovery ? 'num' : 'num text-center text-lg tracking-[0.4em]'}`}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={usingRecovery ? 'XXXXX-XXXXX' : '000000'}
              inputMode={usingRecovery ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              maxLength={usingRecovery ? 16 : 6}
              required
              autoFocus
            />
          </div>

          {error && (
            <p className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary w-full py-2" disabled={busy}>
            {busy ? <IconSpinner /> : null}
            {busy ? 'Verifying…' : 'Verify'}
          </button>
        </form>

        <div className="mt-5 space-y-2 text-center">
          <button
            type="button"
            className="text-xs text-accent hover:underline"
            onClick={() => {
              setUsingRecovery((v) => !v)
              setCode('')
              setError('')
            }}
          >
            {usingRecovery
              ? 'Use your authenticator app instead'
              : "Lost your phone? Use a recovery code"}
          </button>

          <div>
            <button
              type="button"
              className="text-xs text-ink-faint hover:text-ink-dim"
              onClick={() => {
                setStep('credentials')
                setCode('')
                setPassword('')
                setError('')
              }}
            >
              Start over
            </button>
          </div>
        </div>
      </AuthLayout>
    )
  }

  // ---- password + passkey --------------------------------------------------
  const showRegister = config?.registration_enabled || config?.has_users === false

  return (
    <AuthLayout
      title="Sign in"
      subtitle={
        config?.has_users === false
          ? 'No accounts yet — the first one becomes the administrator.'
          : undefined
      }
    >
      {canUsePasskeys && (
        <>
          <button
            type="button"
            className="btn w-full justify-center gap-2 py-2"
            onClick={signInWithPasskey}
            disabled={passkeyBusy}
          >
            {passkeyBusy ? <IconSpinner /> : <IconKey />}
            {passkeyBusy ? 'Waiting for your passkey…' : 'Sign in with a passkey'}
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-line" />
            <span className="text-2xs uppercase tracking-wider text-ink-faint">or</span>
            <div className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <form onSubmit={submitCredentials} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username webauthn"
            required
            autoFocus={!canUsePasskeys}
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
