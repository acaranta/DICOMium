// Inline icons. A 16px stroked set, drawn on a 24px grid — no icon-library dependency,
// and every glyph reads correctly against a black viewport.

interface Props {
  className?: string
}

const base = 'h-4 w-4'

function Svg({ children, className }: Props & { children: React.ReactNode }) {
  return (
    <svg
      className={className ?? base}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** Window/level: a circle half-filled, the universal contrast glyph. */
export const IconWindowLevel = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 3.5v17a8.5 8.5 0 0 0 0-17Z" fill="currentColor" stroke="none" />
  </Svg>
)

export const IconPan = (p: Props) => (
  <Svg {...p}>
    <path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" />
  </Svg>
)

export const IconZoom = (p: Props) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 21 21M8 10.5h5M10.5 8v5" />
  </Svg>
)

export const IconLength = (p: Props) => (
  <Svg {...p}>
    <path d="m4 20 16-16M4 20v-4M4 20h4M20 4v4M20 4h-4" />
  </Svg>
)

export const IconAngle = (p: Props) => (
  <Svg {...p}>
    <path d="M4 19h16M4 19 15 5" />
    <path d="M10.5 19a7 7 0 0 0-1.4-4.2" />
  </Svg>
)

export const IconRectRoi = (p: Props) => (
  <Svg {...p}>
    <rect x="4" y="6" width="16" height="12" rx="1" strokeDasharray="3 2" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </Svg>
)

export const IconEllipseRoi = (p: Props) => (
  <Svg {...p}>
    <ellipse cx="12" cy="12" rx="8" ry="6" strokeDasharray="3 2" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </Svg>
)

export const IconProbe = (p: Props) => (
  <Svg {...p}>
    <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
    <circle cx="12" cy="12" r="2" />
  </Svg>
)

export const IconEraser = (p: Props) => (
  <Svg {...p}>
    <path d="m5 15 6-6 8 8-3 3H8l-3-3a1.4 1.4 0 0 1 0-2Z" />
    <path d="M11 9 15 5l4 4-4 4" />
  </Svg>
)

export const IconInvert = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none" />
  </Svg>
)

export const IconRotate = (p: Props) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 1 1-2.3-5.6" />
    <path d="M20 4v4h-4" />
  </Svg>
)

export const IconFlipH = (p: Props) => (
  <Svg {...p}>
    <path d="M12 3v18" strokeDasharray="2 2" />
    <path d="M9 7 4 12l5 5V7ZM15 7l5 5-5 5V7Z" />
  </Svg>
)

export const IconFlipV = (p: Props) => (
  <Svg {...p}>
    <path d="M3 12h18" strokeDasharray="2 2" />
    <path d="M7 9 12 4l5 5H7ZM7 15l5 5 5-5H7Z" />
  </Svg>
)

export const IconReset = (p: Props) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 1 1 2.3 5.6" />
    <path d="M4 20v-4h4" />
  </Svg>
)

export const IconCamera = (p: Props) => (
  <Svg {...p}>
    <path d="M3 8a2 2 0 0 1 2-2h2.5l1.2-2h6.6l1.2 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    <circle cx="12" cy="12.5" r="3.5" />
  </Svg>
)

export const IconCube = (p: Props) => (
  <Svg {...p}>
    <path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3Z" />
    <path d="M3 7.5 12 12l9-4.5M12 12v9" />
  </Svg>
)

export const IconPlay = (p: Props) => (
  <Svg {...p}>
    <path d="M7 4.5v15l12-7.5-12-7.5Z" fill="currentColor" />
  </Svg>
)

export const IconPause = (p: Props) => (
  <Svg {...p}>
    <path d="M8 4.5v15M16 4.5v15" strokeWidth={2.6} />
  </Svg>
)

export const IconTag = (p: Props) => (
  <Svg {...p}>
    <path d="M3 11.5V4a1 1 0 0 1 1-1h7.5L21 12.5 12.5 21 3 11.5Z" />
    <circle cx="7.5" cy="7.5" r="1.4" />
  </Svg>
)

export const IconRuler = (p: Props) => (
  <Svg {...p}>
    <rect x="2" y="8" width="20" height="8" rx="1" />
    <path d="M6 8v3M10 8v4M14 8v3M18 8v4" />
  </Svg>
)

export const IconUpload = (p: Props) => (
  <Svg {...p}>
    <path d="M12 16V4M12 4 7.5 8.5M12 4l4.5 4.5" />
    <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </Svg>
)

export const IconTrash = (p: Props) => (
  <Svg {...p}>
    <path d="M4 6h16M9 6V4h6v2M6 6l1 14h10l1-14M10 10v6M14 10v6" />
  </Svg>
)

export const IconSearch = (p: Props) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 21 21" />
  </Svg>
)

export const IconLayout = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <path d="M12 3v18M3 12h18" />
  </Svg>
)

export const IconChevron = (p: Props) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
)

export const IconWarn = (p: Props) => (
  <Svg {...p}>
    <path d="M12 4 2.5 20h19L12 4Z" />
    <path d="M12 10v4M12 17h.01" />
  </Svg>
)

export const IconCheck = (p: Props) => (
  <Svg {...p}>
    <path d="m4 12.5 5 5L20 6.5" />
  </Svg>
)

export const IconLogout = (p: Props) => (
  <Svg {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </Svg>
)

export const IconBack = (p: Props) => (
  <Svg {...p}>
    <path d="M19 12H5M5 12l6-6M5 12l6 6" />
  </Svg>
)

/** Passkey: a key. The near-universal glyph for WebAuthn. */
export const IconKey = (p: Props) => (
  <Svg {...p}>
    <circle cx="7.5" cy="15.5" r="3.5" />
    <path d="m10 13 8-8M15.5 7.5l2 2M18 5l2.5 2.5" />
  </Svg>
)

/** TOTP: a phone with a code on it. */
export const IconAuthApp = (p: Props) => (
  <Svg {...p}>
    <rect x="6" y="2.5" width="12" height="19" rx="2" />
    <path d="M9.5 9h5M9.5 12.5h5M11 18h2" />
  </Svg>
)

export const IconShield = (p: Props) => (
  <Svg {...p}>
    <path d="M12 3 4.5 6v6c0 4.2 3 8 7.5 9.5 4.5-1.5 7.5-5.3 7.5-9.5V6L12 3Z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </Svg>
)

export const IconCopy = (p: Props) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="1.5" />
    <path d="M15 9V5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15H9" />
  </Svg>
)

export const IconDownload = (p: Props) => (
  <Svg {...p}>
    <path d="M12 4v12M12 16l-4.5-4.5M12 16l4.5-4.5" />
    <path d="M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />
  </Svg>
)

export const IconCloud = (p: Props) => (
  <Svg {...p}>
    <path d="M7 18a4 4 0 0 1-.6-7.95 5.5 5.5 0 0 1 10.7-1.6A3.75 3.75 0 0 1 17.5 18H7Z" />
  </Svg>
)

export const IconSpinner = ({ className }: Props) => (
  <svg
    className={`${className ?? base} animate-spin`}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.2" />
    <path
      d="M21 12a9 9 0 0 0-9-9"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
)
