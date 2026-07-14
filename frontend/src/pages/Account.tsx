import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  api,
  type RecoveryCodes as RecoveryCodesPayload,
  type SecurityStatus,
  type TotpBegin,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDate } from '../lib/format'
import {
  PasskeyCancelled,
  passkeysAvailable,
  registerPasskey,
  renamePasskey,
  suggestPasskeyName,
} from '../lib/passkeys'
import AppShell from '../components/layout/AppShell'
import ProfileSection from '../components/account/ProfileSection'
import RecoveryCodes from '../components/account/RecoveryCodes'
import {
  IconAuthApp,
  IconCheck,
  IconCloud,
  IconKey,
  IconPencil,
  IconShield,
  IconSpinner,
  IconTrash,
  IconWarn,
} from '../components/ui/Icons'

export default function AccountPage() {
  const { t } = useTranslation('account')
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
          <h1 className="text-base font-medium text-ink">{t('title')}</h1>
          <p className="mt-0.5 num text-xs text-ink-dim">{user?.email}</p>
        </header>

        {newCodes && (
          <div className="mb-6">
            <RecoveryCodes codes={newCodes} onDone={() => setNewCodes(null)} />
          </div>
        )}

        <ProfileSection />
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
  const { t } = useTranslation('account')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // The name is chosen BEFORE the ceremony starts, so the user is not trying to type while the
  // operating system's passkey dialog is up.
  const [naming, setNaming] = useState<string | null>(null)

  // Two independent gates: the browser must support WebAuthn in a secure context, and the
  // server must be able to work out a Relying Party ID for this origin.
  const available = passkeysAvailable() && security.passkeys_supported
  const blockedReason = !passkeysAvailable()
    ? t('passkeys.unsupported')
    : security.passkeys_unsupported_reason

  async function add(nickname: string) {
    setError('')
    setBusy(true)
    try {
      await registerPasskey(nickname.trim() || suggestPasskeyName())
      setNaming(null)
      onChange()
    } catch (err) {
      if (!(err instanceof PasskeyCancelled)) {
        setError(err instanceof Error ? err.message : t('passkeys.addFailed'))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section
      icon={<IconKey className="h-4 w-4" />}
      title={t('passkeys.title')}
      description={t('passkeys.description')}
    >
      {!available ? (
        <div className="flex items-start gap-2 rounded border border-line bg-void px-3 py-2.5">
          <IconWarn className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
          <p className="text-2xs leading-relaxed text-ink-dim">
            {blockedReason}
            <br />
            <span className="text-ink-faint">{t('passkeys.unsupportedFallback')}</span>
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

          {naming === null ? (
            <button
              type="button"
              className="btn"
              onClick={() => setNaming(suggestPasskeyName())}
            >
              <IconKey className="h-3.5 w-3.5" />
              {t('passkeys.add')}
            </button>
          ) : (
            <div className="rounded border border-line bg-void p-3">
              <label className="label" htmlFor="passkey-name">
                {t('passkeys.nameLabel')}
              </label>
              <p className="mb-2 text-2xs text-ink-faint">{t('passkeys.nameHint')}</p>
              <input
                id="passkey-name"
                className="input"
                value={naming}
                onChange={(e) => setNaming(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && naming.trim()) void add(naming)
                  if (e.key === 'Escape') setNaming(null)
                }}
                maxLength={64}
                autoFocus
                disabled={busy}
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!naming.trim() || busy}
                  onClick={() => void add(naming)}
                >
                  {busy ? <IconSpinner className="h-3.5 w-3.5" /> : <IconKey className="h-3.5 w-3.5" />}
                  {busy ? t('passkeys.waiting') : t('action.continue', { ns: 'common' })}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => setNaming(null)}
                >
                  {t('action.cancel', { ns: 'common' })}
                </button>
              </div>
            </div>
          )}
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
  const { t } = useTranslation('account')
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(passkey.nickname)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function commit() {
    const next = name.trim()

    // An empty name is exactly the problem this feature exists to fix, so refuse it here
    // rather than storing "" and rendering a nameless row.
    if (!next) {
      setName(passkey.nickname)
      setEditing(false)
      return
    }
    if (next === passkey.nickname) {
      setEditing(false)
      return
    }

    setSaving(true)
    try {
      await renamePasskey(passkey.id, next)
      setEditing(false)
      setError('')
      onChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('passkeys.renameFailed'))
      setName(passkey.nickname)
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setName(passkey.nickname)
    setEditing(false)
    setError('')
  }

  return (
    <li className="group/row px-3 py-2.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              className="input py-1 text-xs"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void commit()
                if (e.key === 'Escape') cancel()
              }}
              maxLength={64}
              autoFocus
              disabled={saving}
            />
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setEditing(true)}
                title={t('passkeys.rename')}
                className="flex min-w-0 items-center gap-1.5 rounded text-left"
              >
                <span className="truncate text-xs font-medium text-ink">{passkey.nickname}</span>
                <IconPencil className="h-3 w-3 shrink-0 text-ink-faint opacity-0 transition-opacity group-hover/row:opacity-100" />
              </button>

              {passkey.backed_up && (
                <span
                  className="text-ok"
                  title={t('passkeys.backedUp')}
                >
                  <IconCloud className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
          )}

          <p className="num text-2xs text-ink-faint">
            {t('passkeys.added', { date: formatDate(passkey.created_at) })}
            {' · '}
            {passkey.last_used_at
              ? t('passkeys.lastUsed', { date: formatDate(passkey.last_used_at) })
              : t('passkeys.neverUsed')}
          </p>

          {error && <p className="mt-1 text-2xs text-danger">{error}</p>}
        </div>

        <button
          type="button"
          className="tool-btn hover:text-danger"
          title={t('passkeys.remove')}
          onClick={() => setConfirming(true)}
        >
          <IconTrash className="h-3.5 w-3.5" />
        </button>
      </div>

      {confirming && (
        <PasswordConfirm
          label={t('passkeys.removeConfirm', { name: passkey.nickname })}
          action={t('action.remove', { ns: 'common' })}
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
  const { t } = useTranslation('account')
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
      title={t('totp.title')}
      description={t('totp.description')}
    >
      {security.totp_enabled ? (
        <>
          <div className="mb-3 flex items-center gap-2 rounded border border-ok/30 bg-ok/5 px-3 py-2">
            <IconCheck className="h-3.5 w-3.5 text-ok" />
            <span className="text-xs text-ink">{t('totp.enabled')}</span>
          </div>

          {!disabling ? (
            <button type="button" className="btn btn-danger" onClick={() => setDisabling(true)}>
              {t('totp.turnOff')}
            </button>
          ) : (
            <PasswordConfirm
              label={t('totp.turnOffConfirm')}
              hint={t('totp.turnOffHint')}
              action={t('totp.turnOff')}
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
              alt={t('totp.qrAlt')}
              className="h-36 w-36 shrink-0 rounded border border-line bg-white p-1"
            />
            <div className="min-w-0 flex-1">
              <p className="text-2xs leading-relaxed text-ink-dim">{t('totp.scanHint')}</p>
              <p className="mt-2 text-2xs text-ink-faint">{t('totp.manualHint')}</p>
              <code className="mt-1 block break-all rounded border border-line bg-void px-2 py-1.5 num text-2xs text-ink">
                {setup.secret}
              </code>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="totp-code">{t('totp.codeLabel')}</label>
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
              {t('totp.confirm')}
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
              {t('action.cancel', { ns: 'common' })}
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
            {t('totp.setUp')}
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
  const { t } = useTranslation('account')
  const [regenerating, setRegenerating] = useState(false)

  if (!security.totp_enabled) return null

  const remaining = security.recovery_codes_remaining
  const low = remaining <= 3

  return (
    <Section
      icon={<IconShield className="h-4 w-4" />}
      title={t('recovery.title')}
      description={t('recovery.description')}
    >
      {/* One sentence, one key. This was four spliced fragments, which no translator could
          reorder — and the hand-rolled plural was already wrong for French, which treats 0 as
          singular. */}
      <p className={`mb-3 text-xs ${low ? 'text-warn' : 'text-ink-dim'}`}>
        {t('recovery.remaining', { count: remaining })}
        {low && ` — ${t('recovery.runningLow')}`}
      </p>

      {!regenerating ? (
        <button type="button" className="btn" onClick={() => setRegenerating(true)}>
          {t('recovery.generate')}
        </button>
      ) : (
        <PasswordConfirm
          label={t('recovery.generateConfirm')}
          hint={t('recovery.generateHint')}
          action={t('recovery.generate')}
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
  const { t } = useTranslation('account')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setError('')
    setBusy(true)
    try {
      onDone(await api.post<unknown>(endpoint, { password }))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('profile.failed'))
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
        placeholder={t('confirm.password')}
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
          {t('action.cancel', { ns: 'common' })}
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
