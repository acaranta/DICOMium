import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  api,
  type RecoveryCodes as RecoveryCodesPayload,
  type SecurityStatus,
  type TotpBegin,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { PasskeyCancelled, passkeysAvailable, registerPasskey } from '../lib/passkeys'
import AppShell from '../components/layout/AppShell'
import RecoveryCodes from '../components/account/RecoveryCodes'
import {
  IconAuthApp,
  IconCheck,
  IconCloud,
  IconKey,
  IconShield,
  IconSpinner,
  IconTrash,
  IconWarn,
} from '../components/ui/Icons'

export default function AccountPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [newCodes, setNewCodes] = useState<string[] | null>(null)

  const { data: security, isLoading } = useQuery({
    queryKey: ['security'],
    queryFn: () => api.get<SecurityStatus>('/api/account/security'),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['security'] })

  if (isLoading || !security) {
    return (
      <AppShell>
        <div className="flex h-full items-center justify-center text-ink-faint">
          <IconSpinner className="h-5 w-5" />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="mx-auto h-full max-w-2xl overflow-y-auto px-6 py-6">
        <header className="mb-6">
          <h1 className="text-base font-medium text-ink">Account &amp; security</h1>
          <p className="mt-0.5 num text-xs text-ink-dim">{user?.email}</p>
        </header>

        {newCodes && (
          <div className="mb-6">
            <RecoveryCodes codes={newCodes} onDone={() => setNewCodes(null)} />
          </div>
        )}

        <PasskeySection security={security} onChange={invalidate} />
        <TotpSection
          security={security}
          onChange={invalidate}
          onCodes={setNewCodes}
        />
        <RecoverySection security={security} onCodes={setNewCodes} onChange={invalidate} />
      </div>
    </AppShell>
  )
}

// ---- passkeys ----------------------------------------------------------------

function PasskeySection({
  security,
  onChange,
}: {
  security: SecurityStatus
  onChange: () => void
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Two independent gates: the browser must support WebAuthn in a secure context, and the
  // server must be able to work out a Relying Party ID for this origin.
  const available = passkeysAvailable() && security.passkeys_supported
  const blockedReason = !passkeysAvailable()
    ? 'Passkeys need a secure connection. Serve this over HTTPS, or use localhost.'
    : security.passkeys_unsupported_reason

  async function add() {
    setError('')
    setBusy(true)
    try {
      const suggested = navigator.platform || 'This device'
      await registerPasskey(suggested)
      onChange()
    } catch (err) {
      if (!(err instanceof PasskeyCancelled)) {
        setError(err instanceof Error ? err.message : 'Could not add that passkey')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section
      icon={<IconKey className="h-4 w-4" />}
      title="Passkeys"
      description="Sign in with your fingerprint, face or device PIN — no password, no code. A passkey is already two factors: the device you hold, and the biometric that unlocks it."
    >
      {!available ? (
        <div className="flex items-start gap-2 rounded border border-line bg-void px-3 py-2.5">
          <IconWarn className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
          <p className="text-2xs leading-relaxed text-ink-dim">
            {blockedReason}
            <br />
            <span className="text-ink-faint">
              Password sign-in and the authenticator app still work as normal.
            </span>
          </p>
        </div>
      ) : (
        <>
          {security.passkeys.length > 0 && (
            <ul className="mb-3 divide-y divide-line rounded border border-line">
              {security.passkeys.map((key) => (
                <PasskeyRow key={key.id} passkey={key} onChange={onChange} />
              ))}
            </ul>
          )}

          {error && (
            <p className="mb-3 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}

          <button type="button" className="btn" onClick={add} disabled={busy}>
            {busy ? <IconSpinner className="h-3.5 w-3.5" /> : <IconKey className="h-3.5 w-3.5" />}
            {busy ? 'Waiting for your device…' : 'Add a passkey'}
          </button>
        </>
      )}
    </Section>
  )
}

function PasskeyRow({
  passkey,
  onChange,
}: {
  passkey: SecurityStatus['passkeys'][number]
  onChange: () => void
}) {
  const [confirming, setConfirming] = useState(false)

  return (
    <li className="px-3 py-2.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-medium text-ink">{passkey.nickname}</span>
            {passkey.backed_up && (
              <span
                className="text-ok"
                title="Synced to a cloud keychain — it will survive losing this device"
              >
                <IconCloud className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
          <p className="num text-2xs text-ink-faint">
            Added {new Date(passkey.created_at).toLocaleDateString()}
            {passkey.last_used_at
              ? ` · last used ${new Date(passkey.last_used_at).toLocaleDateString()}`
              : ' · never used'}
          </p>
        </div>

        <button
          type="button"
          className="tool-btn hover:text-danger"
          title="Remove this passkey"
          onClick={() => setConfirming(true)}
        >
          <IconTrash className="h-3.5 w-3.5" />
        </button>
      </div>

      {confirming && (
        <PasswordConfirm
          label={`Remove "${passkey.nickname}"?`}
          action="Remove"
          endpoint={`/api/account/passkeys/${passkey.id}/delete`}
          onDone={() => {
            setConfirming(false)
            onChange()
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </li>
  )
}

// ---- TOTP --------------------------------------------------------------------

function TotpSection({
  security,
  onChange,
  onCodes,
}: {
  security: SecurityStatus
  onChange: () => void
  onCodes: (codes: string[]) => void
}) {
  const [setup, setSetup] = useState<TotpBegin | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [disabling, setDisabling] = useState(false)

  const begin = useMutation({
    mutationFn: () => api.post<TotpBegin>('/api/account/totp/begin'),
    onSuccess: setSetup,
    onError: (e: Error) => setError(e.message),
  })

  const confirm = useMutation({
    mutationFn: () =>
      api.post<RecoveryCodesPayload>('/api/account/totp/confirm', { code: code.trim() }),
    onSuccess: (data) => {
      setSetup(null)
      setCode('')
      setError('')
      onCodes(data.codes)
      onChange()
    },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <Section
      icon={<IconAuthApp className="h-4 w-4" />}
      title="Authenticator app"
      description="A 6-digit code from an app like Aegis, 1Password or Google Authenticator, asked for after your password."
    >
      {security.totp_enabled ? (
        <>
          <div className="mb-3 flex items-center gap-2 rounded border border-ok/30 bg-ok/5 px-3 py-2">
            <IconCheck className="h-3.5 w-3.5 text-ok" />
            <span className="text-xs text-ink">Enabled</span>
          </div>

          {!disabling ? (
            <button type="button" className="btn btn-danger" onClick={() => setDisabling(true)}>
              Turn off
            </button>
          ) : (
            <PasswordConfirm
              label="Turn off two-factor authentication?"
              hint="Your recovery codes will be revoked at the same time."
              action="Turn off"
              endpoint="/api/account/totp/disable"
              onDone={() => {
                setDisabling(false)
                onChange()
              }}
              onCancel={() => setDisabling(false)}
            />
          )}
        </>
      ) : setup ? (
        <div className="space-y-3">
          <div className="flex gap-4">
            <img
              src={setup.qr_data_url}
              alt="QR code for your authenticator app"
              className="h-36 w-36 shrink-0 rounded border border-line bg-white p-1"
            />
            <div className="min-w-0 flex-1">
              <p className="text-2xs leading-relaxed text-ink-dim">
                Scan this with your authenticator app, then enter the code it shows.
              </p>
              <p className="mt-2 text-2xs text-ink-faint">Or enter this key by hand:</p>
              <code className="mt-1 block break-all rounded border border-line bg-void px-2 py-1.5 num text-2xs text-ink">
                {setup.secret}
              </code>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="totp-code">Code from the app</label>
            <input
              id="totp-code"
              className="input num text-center text-lg tracking-[0.4em]"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
              inputMode="numeric"
              maxLength={6}
              autoFocus
            />
          </div>

          {error && (
            <p className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={code.trim().length !== 6 || confirm.isPending}
              onClick={() => confirm.mutate()}
            >
              {confirm.isPending ? <IconSpinner className="h-3.5 w-3.5" /> : null}
              Confirm
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setSetup(null)
                setCode('')
                setError('')
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {error && (
            <p className="mb-3 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => begin.mutate()}
            disabled={begin.isPending}
          >
            {begin.isPending ? <IconSpinner className="h-3.5 w-3.5" /> : null}
            Set up
          </button>
        </>
      )}
    </Section>
  )
}

// ---- recovery codes ----------------------------------------------------------

function RecoverySection({
  security,
  onCodes,
  onChange,
}: {
  security: SecurityStatus
  onCodes: (codes: string[]) => void
  onChange: () => void
}) {
  const [regenerating, setRegenerating] = useState(false)

  if (!security.totp_enabled) return null

  const remaining = security.recovery_codes_remaining
  const low = remaining <= 3

  return (
    <Section
      icon={<IconShield className="h-4 w-4" />}
      title="Recovery codes"
      description="Single-use codes to sign in when your authenticator is not to hand."
    >
      <p className={`mb-3 text-xs ${low ? 'text-warn' : 'text-ink-dim'}`}>
        <span className="num">{remaining}</span> code{remaining === 1 ? '' : 's'} remaining
        {low && ' — generate a new set soon'}
      </p>

      {!regenerating ? (
        <button type="button" className="btn" onClick={() => setRegenerating(true)}>
          Generate new codes
        </button>
      ) : (
        <PasswordConfirm
          label="Generate a new set of recovery codes?"
          hint="Your existing codes will stop working immediately."
          action="Generate"
          endpoint="/api/account/recovery-codes"
          onDone={(data) => {
            setRegenerating(false)
            const payload = data as RecoveryCodesPayload | undefined
            if (payload?.codes) onCodes(payload.codes)
            onChange()
          }}
          onCancel={() => setRegenerating(false)}
        />
      )}
    </Section>
  )
}

// ---- shared ------------------------------------------------------------------

/**
 * Re-authentication before a destructive security change.
 *
 * Without this, anyone holding a stolen session could quietly strip MFA off the account —
 * which would make the whole feature ornamental the moment a session leaked.
 */
function PasswordConfirm({
  label,
  hint,
  action,
  endpoint,
  onDone,
  onCancel,
}: {
  label: string
  hint?: string
  action: string
  endpoint: string
  onDone: (data?: unknown) => void
  onCancel: () => void
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setError('')
    setBusy(true)
    try {
      onDone(await api.post<unknown>(endpoint, { password }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2 rounded border border-line bg-void p-3">
      <p className="text-xs text-ink">{label}</p>
      {hint && <p className="mt-0.5 text-2xs text-ink-dim">{hint}</p>}

      <input
        type="password"
        className="input mt-2"
        placeholder="Confirm your password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && password && submit()}
        autoComplete="current-password"
        autoFocus
      />

      {error && <p className="mt-2 text-2xs text-danger">{error}</p>}

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="btn btn-danger"
          disabled={!password || busy}
          onClick={submit}
        >
          {busy ? <IconSpinner className="h-3.5 w-3.5" /> : null}
          {action}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-6 rounded border border-line bg-panel p-4">
      <div className="mb-3 flex items-start gap-2.5">
        <span className="mt-0.5 text-accent">{icon}</span>
        <div>
          <h2 className="text-xs font-medium text-ink">{title}</h2>
          <p className="mt-0.5 text-2xs leading-relaxed text-ink-dim">{description}</p>
        </div>
      </div>
      {children}
    </section>
  )
}
