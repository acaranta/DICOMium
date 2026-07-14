import { useCallback, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../lib/auth'
import { useClickOutside } from '../../lib/useClickOutside'
import { useLanguage } from '../../lib/useLanguage'
import { LANGUAGE_NAMES, type Language } from '../../lib/i18n'
import type { AvatarColor, AvatarStyle } from '../../lib/avatar'
import Avatar from '../ui/Avatar'
import { IconAdmin, IconChevron, IconCheck, IconLogout, IconSettings } from '../ui/Icons'

export default function UserMenu() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const { language, preference, languages, setLanguage } = useLanguage()
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const [languagesOpen, setLanguagesOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    setLanguagesOpen(false)
  }, [])
  useClickOutside(ref, close, open)

  if (!user) return null

  const avatar = (size: number) => (
    <Avatar
      email={user.email}
      style={user.avatar_style as AvatarStyle}
      color={user.avatar_color as AvatarColor}
      gravatarHash={user.gravatar_hash}
      useGravatar={user.use_gravatar}
      size={size}
    />
  )

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('menu.open')}
        className={`flex items-center gap-2 rounded border px-2 py-1.5 transition-colors ${
          open
            ? 'border-line-bright bg-raised'
            : 'border-transparent hover:border-line hover:bg-raised'
        }`}
      >
        {avatar(26)}
        <span className="hidden max-w-[14rem] truncate font-mono text-2xs text-ink-dim sm:block">
          {user.email}
        </span>
        <IconChevron
          className={`h-3.5 w-3.5 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1.5 w-64 overflow-hidden rounded border border-line bg-raised shadow-xl"
        >
          {/* The identity, always legible — the button itself truncates on a narrow header. */}
          <div className="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
            {avatar(32)}
            <div className="min-w-0">
              <div className="truncate font-mono text-2xs text-ink">{user.email}</div>
              <div className="text-2xs text-ink-faint">
                {user.is_admin ? t('menu.roleAdmin') : t('menu.roleUser')}
              </div>
            </div>
          </div>

          <div className="py-1">
            <MenuLink to="/account" onClick={close} icon={<IconSettings className="h-3.5 w-3.5" />}>
              {t('menu.accountSecurity')}
            </MenuLink>

            {user.is_admin && (
              <MenuLink to="/admin" onClick={close} icon={<IconAdmin className="h-3.5 w-3.5" />}>
                {t('menu.administration')}
              </MenuLink>
            )}
          </div>

          {/* Language ------------------------------------------------------- */}
          <div className="border-t border-line py-1">
            <button
              type="button"
              role="menuitem"
              aria-expanded={languagesOpen}
              onClick={() => setLanguagesOpen((v) => !v)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-ink-dim transition-colors hover:bg-hover hover:text-ink"
            >
              <span className="font-mono text-2xs uppercase text-ink-faint">{language}</span>
              <span className="flex-1">{t('menu.language')}</span>
              <IconChevron
                className={`h-3 w-3 text-ink-faint transition-transform ${
                  languagesOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {languagesOpen && (
              <div className="pb-1">
                <LanguageOption
                  selected={preference === 'auto'}
                  onClick={() => void setLanguage('auto')}
                >
                  {t('language.auto')}
                </LanguageOption>

                {languages.map((code) => (
                  <LanguageOption
                    key={code}
                    selected={preference === code}
                    onClick={() => void setLanguage(code as Language)}
                  >
                    {LANGUAGE_NAMES[code as Language]}
                  </LanguageOption>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-line py-1">
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-danger transition-colors hover:bg-danger/10"
              onClick={async () => {
                close()
                await logout()
                navigate('/login', { replace: true })
              }}
            >
              <IconLogout className="h-3.5 w-3.5" />
              {t('menu.signOut')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function LanguageOption({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onClick}
      className={`flex w-full items-center gap-2 py-1.5 pl-9 pr-3 text-left text-2xs transition-colors hover:bg-hover ${
        selected ? 'text-accent' : 'text-ink-dim hover:text-ink'
      }`}
    >
      <span className="flex-1">{children}</span>
      {selected && <IconCheck className="h-3 w-3" />}
    </button>
  )
}

function MenuLink({
  to,
  icon,
  onClick,
  children,
}: {
  to: string
  icon: React.ReactNode
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Link
      to={to}
      role="menuitem"
      onClick={onClick}
      className="flex items-center gap-2.5 px-3 py-2 text-xs text-ink-dim transition-colors hover:bg-hover hover:text-ink"
    >
      <span className="text-ink-faint">{icon}</span>
      {children}
    </Link>
  )
}
