import { useEffect, useState } from 'react'
import {
  avatarStyles,
  gravatarUrl,
  initialsFor,
  type AvatarColor,
  type AvatarStyle,
} from '../../lib/avatar'

interface Props {
  email: string | undefined
  style?: AvatarStyle | null
  color?: AvatarColor | null
  /** Only ever consulted when `useGravatar` is true. */
  gravatarHash?: string | null
  useGravatar?: boolean
  /** Rendered size in px. */
  size?: number
  className?: string
}

/**
 * The user's avatar: generated initials, or Gravatar if they opted in.
 *
 * Gravatar is a deliberate, informed opt-in. When `useGravatar` is false this component makes
 * NO third-party request at all — not a prefetch, not a preconnect. That is the difference
 * between the app's privacy claim being true and being nearly true.
 */
export default function Avatar({
  email,
  style = 'solid',
  color = 'cyan',
  gravatarHash,
  useGravatar = false,
  size = 28,
  className = '',
}: Props) {
  const [gravatarFailed, setGravatarFailed] = useState(false)

  // A new hash means a different person: give their Gravatar a fresh chance rather than
  // inheriting the previous user's failure.
  useEffect(() => setGravatarFailed(false), [gravatarHash])

  const showGravatar = useGravatar && !!gravatarHash && !gravatarFailed

  if (showGravatar) {
    return (
      <img
        src={gravatarUrl(gravatarHash!, size)}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={`shrink-0 rounded-full object-cover ${className}`}
        // d=404 means "no Gravatar for this address", which arrives here as an error. Fall
        // back to the generated avatar rather than showing a broken image.
        onError={() => setGravatarFailed(true)}
        draggable={false}
      />
    )
  }

  const css = avatarStyles(style ?? 'solid', color ?? 'cyan')

  return (
    <span
      className={`flex shrink-0 select-none items-center justify-center rounded-full font-medium leading-none ${className}`}
      style={{
        ...css.container,
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
      }}
      aria-hidden="true"
    >
      <span style={css.text}>{initialsFor(email)}</span>
    </span>
  )
}
