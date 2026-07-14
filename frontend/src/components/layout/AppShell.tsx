import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../ui/Logo'
import UserMenu from './UserMenu'

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-base">
      {/* 56px, not 44: the old bar was cramped, and it now has to carry an avatar. */}
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-panel px-4">
        <Link to="/" className="flex items-center gap-2.5">
          <Logo className="h-7 w-7" />
          <span className="font-mono text-base font-medium tracking-tight">DICOMium</span>
        </Link>

        <div className="flex-1" />

        {/* Everything about "you" — identity, settings, administration, sign out — lives here. */}
        <UserMenu />
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
