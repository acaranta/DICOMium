import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Enums, type RenderingEngine, type Types, eventTarget } from '@cornerstonejs/core'
// stackContextPrefetch lives in tools, not core.
import { utilities as toolUtilities } from '@cornerstonejs/tools'
import type { Series, Study } from '../../lib/api'
import { loadSeriesImageIds } from '../../cornerstone/imageIds'
import { addViewports, STACK_TOOL_GROUP } from '../../cornerstone/toolGroups'
import ViewportOverlay from './ViewportOverlay'
import { IconSpinner } from '../ui/Icons'

const { ViewportType, Events } = Enums

export interface ViewportHandle {
  viewport: Types.IStackViewport
  element: HTMLDivElement
}

/**
 * One cell of the grid: a Cornerstone stack viewport plus its corner annotations.
 *
 * The series is loaded when it is assigned and torn down when the cell is cleared, so a
 * 3x3 grid never holds nine studies' pixels in memory at once.
 */
export default function Viewport({
  slotId,
  seriesUid,
  study,
  series,
  engine,
  active,
  onActivate,
  onDropSeries,
  onReady,
  onSopChange,
}: {
  slotId: string
  seriesUid: string | null
  study: Study
  series: Series | undefined
  engine: RenderingEngine
  active: boolean
  onActivate: () => void
  onDropSeries: (seriesUid: string) => void
  onReady: (handle: ViewportHandle | null) => void
  onSopChange: (sopUid: string | null) => void
}) {
  const { t } = useTranslation('viewer')
  const elementRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [index, setIndex] = useState({ current: 0, total: 0 })
  const [voi, setVoi] = useState<{ width: number; center: number } | null>(null)
  const [zoom, setZoom] = useState(1)

  // Load / swap the series.
  useEffect(() => {
    const element = elementRef.current
    if (!element || !seriesUid) {
      onReady(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    void (async () => {
      try {
        engine.enableElement({
          viewportId: slotId,
          type: ViewportType.STACK,
          element,
          defaultOptions: { background: [0, 0, 0] as Types.Point3 },
        })

        const viewport = engine.getViewport(slotId) as Types.IStackViewport
        addViewports(STACK_TOOL_GROUP, [slotId])

        const { imageIds } = await loadSeriesImageIds(study.study_instance_uid, seriesUid)
        if (cancelled) return
        if (!imageIds.length) throw new Error(t('viewport.noImages'))

        await viewport.setStack(imageIds, 0)
        viewport.render()

        // Prefetch neighbouring slices so scrolling does not stall on every frame.
        toolUtilities.stackContextPrefetch.enable(element)

        if (cancelled) return
        setIndex({ current: 1, total: imageIds.length })
        onReady({ viewport, element })
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('viewport.loadFailed'))
          onReady(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      try {
        engine.disableElement(slotId)
      } catch {
        /* already gone */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesUid, slotId, engine, study.study_instance_uid])

  // Track slice index / window-level / zoom for the overlay.
  useEffect(() => {
    const element = elementRef.current
    if (!element || !seriesUid) return

    const onImageRendered = () => {
      const viewport = engine.getViewport(slotId) as Types.IStackViewport | undefined
      if (!viewport) return

      const ids = viewport.getImageIds?.() ?? []
      const current = viewport.getCurrentImageIdIndex?.() ?? 0
      setIndex({ current: current + 1, total: ids.length })

      const properties = viewport.getProperties?.()
      const range = properties?.voiRange
      if (range) {
        setVoi({
          width: range.upper - range.lower,
          center: (range.upper + range.lower) / 2,
        })
      }
      setZoom(viewport.getZoom?.() ?? 1)

      // The tag inspector follows whatever slice is on screen.
      const imageId = ids[current]
      if (imageId) {
        const match = /instances\/([\d.]+)\/frames/.exec(imageId)
        onSopChange(match?.[1] ?? null)
      }
    }

    element.addEventListener(Events.IMAGE_RENDERED, onImageRendered)
    return () => element.removeEventListener(Events.IMAGE_RENDERED, onImageRendered)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesUid, slotId, engine])

  // Resize with the grid.
  useEffect(() => {
    const element = elementRef.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      try {
        engine.resize(true, false)
      } catch {
        /* engine torn down */
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [engine])

  return (
    <div
      className="viewport-cell"
      data-active={active}
      onClick={onActivate}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const uid = e.dataTransfer.getData('application/x-series-uid')
        if (uid) onDropSeries(uid)
      }}
    >
      {/* The Cornerstone enabled element. It must not have children of its own — the
          library appends its canvas and SVG layer here. */}
      <div
        ref={elementRef}
        className="cs-element absolute inset-0"
        // Cornerstone binds the right button for zoom; the browser menu would eat it.
        onContextMenu={(e) => e.preventDefault()}
      />

      {seriesUid && series && !error && (
        <ViewportOverlay
          study={study}
          series={series}
          index={index}
          voi={voi}
          zoom={zoom}
        />
      )}

      {loading && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <IconSpinner className="h-5 w-5 text-accent" />
        </div>
      )}

      {error && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4">
          <p className="text-center text-xs text-danger">{error}</p>
        </div>
      )}

      {!seriesUid && !loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-2xs uppercase tracking-wider text-ink-faint">
            {dragOver ? t('viewport.releaseToLoad') : t('viewport.dropHere')}
          </p>
        </div>
      )}

      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-30 bg-accent/10 ring-1 ring-inset ring-accent" />
      )}
    </div>
  )
}

export { eventTarget }
