import { useEffect, useState } from 'react'
import { RenderingEngine, getRenderingEngine } from '@cornerstonejs/core'
import { csInit, RENDERING_ENGINE_ID } from './init'
import { destroyToolGroup, MPR_TOOL_GROUP, STACK_TOOL_GROUP } from './toolGroups'

/**
 * Owns the single RenderingEngine for the viewer page.
 *
 * Cornerstone is initialized once per tab, but the engine is created and destroyed with
 * the page — leaving it alive would leak its WebGL contexts, and browsers cap those at
 * around 16 before they start silently killing the oldest.
 */
export function useRenderingEngine(): RenderingEngine | null {
  const [engine, setEngine] = useState<RenderingEngine | null>(null)

  useEffect(() => {
    let cancelled = false

    void csInit().then(() => {
      if (cancelled) return

      // StrictMode's double-mount can leave the previous engine behind.
      const existing = getRenderingEngine(RENDERING_ENGINE_ID)
      if (existing) existing.destroy()

      setEngine(new RenderingEngine(RENDERING_ENGINE_ID))
    })

    return () => {
      cancelled = true
      destroyToolGroup(STACK_TOOL_GROUP)
      destroyToolGroup(MPR_TOOL_GROUP)
      getRenderingEngine(RENDERING_ENGINE_ID)?.destroy()
      setEngine(null)
    }
  }, [])

  return engine
}
