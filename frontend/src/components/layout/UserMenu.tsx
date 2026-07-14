import { useCallback, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useClickOutside } from '../../lib/useClickOutside'
import type { AvatarColor, AvatarStyle } from '../../lib/avatar'
import Avatar from '../ui/Avatar'
import { IconAdmin, IconChevron, IconLogout, IconSettings } from '../ui/Icons'

export default function UserMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])
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
                {user.is_admin ? 'Administrator' : 'User'}
              </div>
            </div>
          </div>

          <div className="py-1">
            <MenuLink to="/account" onClick={close} icon={<IconSettings className="h-3.5 w-3.5" />}>
              Account &amp; security
            </MenuLink>

            {user.is_admin && (
              <MenuLink to="/admin" onClick={close} icon={<IconAdmin className="h-3.5 w-3.5" />}>
                Administration
              </MenuLink>
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
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
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
