import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { IconLogout } from '../ui/Icons'

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex h-screen flex-col bg-base">
      <header className="flex h-11 shrink-0 items-center gap-4 border-b border-line bg-panel px-4">
        <Link to="/" className="flex items-center gap-2">
          <svg className="h-5 w-5 text-accent" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4" opacity="0.45" />
            <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.4" />
            <path
              d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
          <span className="font-mono text-sm font-medium tracking-tight">webdicom</span>
        </Link>

        <div className="flex-1" />

        {user?.is_admin && (
          <Link to="/admin" className="text-xs text-ink-dim transition-colors hover:text-ink">
            Administration
          </Link>
        )}

        <span className="font-mono text-2xs text-ink-faint">{user?.email}</span>

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
