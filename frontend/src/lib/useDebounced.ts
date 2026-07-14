import { useEffect, useState } from 'react'

/**
 * A value that lags behind, settling only once the user stops changing it.
 *
 * The study search puts its term straight into a TanStack query key, so without this every
 * keystroke is an HTTP request: typing "smith" fires five. That was merely wasteful when the
 * query was a plain SELECT; now that each one also runs a COUNT(*) over the same predicate, it
 * is worth not doing.
 */
export function useDebounced<T>(value: T, delayMs = 250): T {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return settled
}
