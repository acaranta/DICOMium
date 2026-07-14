// Generated initials avatars.
//
// Colours are hex, applied as inline styles rather than Tailwind classes. Tailwind's JIT only
// emits classes it can see literally in the source, so a template like `bg-${color}-500` would
// be purged from the build and every avatar would come out transparent. Inline styles sidestep
// that entirely, and they make the gradient and pattern variants trivial.

export type AvatarStyle = 'solid' | 'ring' | 'gradient' | 'pattern'
export type AvatarColor =
  | 'cyan' | 'teal' | 'emerald' | 'violet' | 'indigo' | 'amber' | 'rose' | 'slate'

interface Swatch {
  /** The base tone. Carries white initials at legible contrast. */
  base: string
  /** A deeper tone, for the gradient's far end and the pattern's ground. */
  deep: string
}

export const PALETTE: Record<AvatarColor, Swatch> = {
  cyan: { base: '#22d3ee', deep: '#0e7490' },
  teal: { base: '#14b8a6', deep: '#0f766e' },
  emerald: { base: '#10b981', deep: '#047857' },
  violet: { base: '#8b5cf6', deep: '#6d28d9' },
  indigo: { base: '#6366f1', deep: '#4338ca' },
  amber: { base: '#f59e0b', deep: '#b45309' },
  rose: { base: '#f43f5e', deep: '#be123c' },
  slate: { base: '#64748b', deep: '#334155' },
}

export const COLORS = Object.keys(PALETTE) as AvatarColor[]
export const STYLES: AvatarStyle[] = ['solid', 'ring', 'gradient', 'pattern']

/**
 * Initials from an email.
 *
 * "jane.doe@x.com" -> "JD", "arthur@x.com" -> "A". Two letters when the local part has an
 * obvious separator, one otherwise — inventing a second letter from a single word produces
 * things like "AR", which looks like a mistake rather than a monogram.
 */
export function initialsFor(email: string | undefined): string {
  const local = (email ?? '').split('@')[0] ?? ''
  const parts = local.split(/[.\-_+]/).filter(Boolean)

  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return (local[0] ?? '?').toUpperCase()
}

/** The CSS for one avatar. */
export function avatarStyles(
  style: AvatarStyle,
  color: AvatarColor,
): { container: React.CSSProperties; text: React.CSSProperties } {
  const { base, deep } = PALETTE[color] ?? PALETTE.cyan

  switch (style) {
    case 'ring':
      return {
        container: {
          background: 'transparent',
          boxShadow: `inset 0 0 0 2px ${base}`,
        },
        text: { color: base },
      }

    case 'gradient':
      return {
        container: { background: `linear-gradient(135deg, ${base} 0%, ${deep} 100%)` },
        text: { color: '#fff' },
      }

    case 'pattern':
      return {
        container: {
          backgroundColor: deep,
          // Fine diagonal hatching — reads as texture at 28px, not as noise.
          backgroundImage: `repeating-linear-gradient(45deg, ${base} 0 2px, transparent 2px 6px)`,
        },
        text: { color: '#fff' },
      }

    case 'solid':
    default:
      return {
        container: { background: base },
        text: { color: '#fff' },
      }
  }
}

/**
 * The Gravatar URL for a hash the server computed.
 *
 * `d=404` is deliberate: it makes "this person has no Gravatar" an honest 404 that we can catch
 * and fall back from. The default would serve Gravatar's grey mystery-person instead, leaving a
 * user who enabled the switch with a blank stranger and no clue why.
 */
export function gravatarUrl(hash: string, size: number): string {
  return `https://gravatar.com/avatar/${hash}?s=${size * 2}&d=404`
}
