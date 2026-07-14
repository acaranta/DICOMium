import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, type Preferences } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import {
  STYLE_LABELS,
  PALETTE,
  type AvatarColor,
  type AvatarStyle,
} from '../../lib/avatar'
import Avatar from '../ui/Avatar'
import { IconCheck, IconSpinner, IconWarn } from '../ui/Icons'

/**
 * Avatar: colour, style, and the Gravatar opt-in.
 *
 * The Gravatar switch is the only control in this app that causes an outbound request to a
 * third party, so it says so, in plain words, right next to itself.
 */
export default function ProfileSection() {
  const { user, refresh } = useAuth()
  const [error, setError] = useState('')

  const { data: prefs, refetch } = useQuery({
    queryKey: ['preferences'],
    queryFn: () => api.get<Preferences>('/api/account/preferences'),
  })

  const save = useMutation({
    mutationFn: (patch: Partial<Preferences>) =>
      api.patch<Preferences>('/api/account/preferences', patch),
    onSuccess: async () => {
      setError('')
      await refetch()
      // The header renders from the auth context, so it must be refreshed or the avatar there
      // would keep showing the old choice until the next full page load.
      await refresh()
    },
    onError: (e: Error) => setError(e.message),
  })

  if (!prefs || !user) {
    return (
      <section className="mb-6 flex justify-center rounded border border-line bg-panel p-8">
        <IconSpinner className="h-5 w-5 text-ink-faint" />
      </section>
    )
  }

  const style = prefs.avatar_style as AvatarStyle
  const color = prefs.avatar_color as AvatarColor

  return (
    <section className="mb-6 rounded border border-line bg-panel p-4">
      <div className="mb-4 flex items-center gap-4">
        <Avatar
          email={user.email}
          style={style}
          color={color}
          gravatarHash={prefs.gravatar_hash}
          useGravatar={prefs.use_gravatar}
          size={56}
        />
        <div>
          <h2 className="text-xs font-medium text-ink">Avatar</h2>
          <p className="mt-0.5 text-2xs leading-relaxed text-ink-dim">
            Generated from your initials. Pick a colour and a style, or use your Gravatar.
          </p>
        </div>
      </div>

      {/* Colour ------------------------------------------------------------ */}
      <fieldset className="mb-4" disabled={prefs.use_gravatar}>
        <legend className="label">Colour</legend>
        <div className={`flex flex-wrap gap-2 ${prefs.use_gravatar ? 'opacity-40' : ''}`}>
          {prefs.available_colors.map((c) => {
            const swatch = PALETTE[c as AvatarColor]
            if (!swatch) return null
            const selected = c === color
            return (
              <button
                key={c}
                type="button"
                title={c}
                aria-label={c}
                aria-pressed={selected}
                onClick={() => save.mutate({ avatar_color: c })}
                className="h-7 w-7 rounded-full transition-transform hover:scale-110 disabled:cursor-not-allowed"
                style={{
                  background: swatch.base,
                  boxShadow: selected
                    ? `0 0 0 2px #131518, 0 0 0 4px ${swatch.base}`
                    : undefined,
                }}
              >
                {selected && <IconCheck className="mx-auto h-4 w-4 text-white" />}
              </button>
            )
          })}
        </div>
      </fieldset>

      {/* Style ------------------------------------------------------------- */}
      <fieldset className="mb-4" disabled={prefs.use_gravatar}>
        <legend className="label">Style</legend>
        <div className={`flex flex-wrap gap-2 ${prefs.use_gravatar ? 'opacity-40' : ''}`}>
          {prefs.available_styles.map((s) => {
            const selected = s === style
            return (
              <button
                key={s}
                type="button"
                onClick={() => save.mutate({ avatar_style: s })}
                className={`flex items-center gap-2 rounded border px-2.5 py-1.5 transition-colors ${
                  selected
                    ? 'border-accent bg-accent/10'
                    : 'border-line bg-raised hover:border-line-bright'
                }`}
              >
                {/* A live preview in the user's own colour — a name like "Pattern" means
                    nothing until you can see it. */}
                <Avatar
                  email={user.email}
                  style={s as AvatarStyle}
                  color={color}
                  size={22}
                  useGravatar={false}
                />
                <span className={`text-2xs ${selected ? 'text-accent' : 'text-ink-dim'}`}>
                  {STYLE_LABELS[s as AvatarStyle] ?? s}
                </span>
              </button>
            )
          })}
        </div>
      </fieldset>

      {/* Gravatar ---------------------------------------------------------- */}
      <div className="rounded border border-line bg-void p-3">
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={prefs.use_gravatar}
            onChange={(e) => save.mutate({ use_gravatar: e.target.checked })}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-line bg-void accent-accent"
          />
          <span className="min-w-0">
            <span className="block text-xs text-ink">Use my Gravatar instead</span>
            <span className="mt-1 flex items-start gap-1.5 text-2xs leading-relaxed text-ink-dim">
              <IconWarn className="mt-px h-3 w-3 shrink-0 text-warn" />
              <span>
                This sends a hash of your email address to <strong>gravatar.com</strong> and
                reveals your IP address to them. Your scans never leave this server — but this
                does. With it off, DICOMium makes no third-party requests at all.
              </span>
            </span>
          </span>
        </label>
      </div>

      {error && (
        <p className="mt-3 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
    </section>
  )
}
