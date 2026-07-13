import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { IconLogout } from '../ui/Icons'
import Logo from '../ui/Logo'

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex h-screen flex-col bg-base">
      <header className="flex h-11 shrink-0 items-center gap-4 border-b border-line bg-panel px-4">
        <Link to="/" className="flex items-center gap-2">
          <Logo className="h-5 w-5" />
          <span className="font-mono text-sm font-medium tracking-tight">DICOMium</span>
        </Link>

        <div className="flex-1" />

        {user?.is_admin && (
          <Link to="/admin" className="text-xs text-ink-dim transition-colors hover:text-ink">
            Administration
          </Link>
        )}

        <Link
          to="/account"
          className="font-mono text-2xs text-ink-faint transition-colors hover:text-ink"
          title="Account & security"
        >
          {user?.email}
        </Link>

        <button
          type="button"
          className="tool-btn"
          title="Sign out"
          onClick={async () => {
            await logout()
            navigate('/login', { replace: true })
          }}
        >
          <IconLogout />
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
