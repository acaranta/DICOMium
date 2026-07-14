import { useEffect, type RefObject } from 'react'

/**
 * Close a popover on an outside click, or on Escape.
 *
 * The dropdowns in the viewer toolbar close with `onBlur={() => setTimeout(close, 120)}`. That
 * is survivable for a menu whose items are `onMouseDown` handlers, but it is the wrong tool for
 * a menu containing router links and a destructive Sign out: blur fires before the click lands,
 * and the 120ms race occasionally eats it. This listens for the click itself, so there is
 * nothing to race.
 *
 * Uses `mousedown` rather than `click`, so the menu closes on press rather than on release —
 * which is what a user expects, and what stops a click "passing through" to whatever is beneath.
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  active = true,
): void {
  useEffect(() => {
    if (!active) return

    const onPointer = (event: MouseEvent | TouchEvent) => {
      const el = ref.current
      if (el && !el.contains(event.target as Node)) onClose()
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', onPointer)
    document.addEventListener('touchstart', onPointer)
    document.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('touchstart', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [ref, onClose, active])
}
