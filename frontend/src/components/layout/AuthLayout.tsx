import type { ReactNode } from 'react'
import Logo from '../ui/Logo'

/**
 * The sign-in frame.
 *
 * The backdrop is a faint scan-line grid — the visual language of an imaging console,
 * not a SaaS landing page. It sits at very low contrast so it reads as texture rather
 * than decoration.
 */
export default function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-base px-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.055]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 70% 60% at 50% 45%, #000 40%, transparent 100%)',
        }}
        aria-hidden
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 flex items-center justify-center gap-2.5">
            <Logo className="h-7 w-7" />
            <span className="font-mono text-lg font-medium tracking-tight text-ink">
              DICOMium
            </span>
          </div>
          <h1 className="text-base font-medium text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 text-xs leading-relaxed text-ink-dim">{subtitle}</p>}
        </div>

        <div className="rounded border border-line bg-panel p-6">{children}</div>

        <p className="mt-6 text-center font-mono text-2xs text-ink-faint">
          Medical imaging · private · self-hosted
        </p>
      </div>
    </div>
  )
}
