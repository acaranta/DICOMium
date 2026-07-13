import type { ReactNode } from 'react'

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
            <Logo />
            <span className="font-mono text-lg font-medium tracking-tight text-ink">
              webdicom
            </span>
          </div>
          <h1 className="text-base font-medium text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 text-xs leading-relaxed text-ink-dim">{subtitle}</p>}
        </div>

        <div className="rounded border border-line bg-panel p-6">{children}</div>

        <p className="mt-6 text-center font-mono text-2xs text-ink-faint">
          DICOM viewer · self-hosted
        </p>
      </div>
    </div>
  )
}

/** A stylized axial slice: the aperture ring plus crosshairs. */
function Logo() {
  return (
    <svg className="h-6 w-6 text-accent" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4" opacity="0.45" />
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
