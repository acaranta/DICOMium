import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { api, type StudyDetail } from '../lib/api'
import { useViewerStore } from '../store/viewerStore'
import { useRenderingEngine } from '../cornerstone/useRenderingEngine'
import { createStackToolGroup, setActiveTool, STACK_TOOL_GROUP } from '../cornerstone/toolGroups'
import { collectMeasurements, onAnnotationsChanged } from '../cornerstone/measurements'
import { toVoiRange, type WlPreset } from '../cornerstone/wlPresets'
import { captureViewport } from '../cornerstone/screenshot'
import { TOOLBAR, type ToolId } from '../cornerstone/tools'
import AppShell from '../components/layout/AppShell'
import SeriesPanel from '../components/viewer/SeriesPanel'
import ViewerToolbar, { type ToolbarActions } from '../components/viewer/ViewerToolbar'
import Viewport, { type ViewportHandle } from '../components/viewer/Viewport'
import ViewportOverlayPanels from '../components/viewer/RightPanel'
import MprView from '../components/viewer/MprView'
import { IconSpinner, IconWarn } from '../components/ui/Icons'

export default function ViewerPage() {
  const { t } = useTranslation('viewer')
  const { studyUid = '' } = useParams()
  const engine = useRenderingEngine()

  const {
    layout,
    viewports,
    activeViewportId,
    activeTool,
    mprActive,
    mprSeriesUid,
    rightPanel,
    inspectorSopUid,
    setStudy,
    setActiveViewport,
    setActiveTool: selectTool,
    assignSeries,
    enterMpr,
    exitMpr,
    setMeasurements,
    setInspectorSop,
    reset,
  } = useViewerStore()

  // Live Cornerstone viewport handles, keyed by slot. A ref, not state: they are needed
  // inside imperative toolbar callbacks, not for rendering.
  const handles = useRef<Record<string, ViewportHandle | null>>({})
  const [mprError, setMprError] = useState('')

  const { data: study, isLoading } = useQuery({
    queryKey: ['study', studyUid],
    queryFn: () => api.get<StudyDetail>(`/api/studies/${studyUid}`),
  })

  useEffect(() => {
    setStudy(studyUid)
    return reset
  }, [studyUid, setStudy, reset])

  // Auto-load a sensible series so the viewer is never a blank grid.
  //
  // NOT simply the first one: series 1 is almost always the 2-image scout/localizer,
  // which is the least useful thing to open on. Prefer the largest reconstructable
  // series — that is the primary acquisition.
  useEffect(() => {
    if (!study || !engine) return
    if (useViewerStore.getState().viewports[0].seriesUid) return

    const viewable = study.series.filter((s) => s.is_viewable)
    if (!viewable.length) return

    const bySize = (a: typeof viewable[number], b: typeof viewable[number]) =>
      b.num_instances - a.num_instances
    const primary =
      viewable.filter((s) => s.is_reconstructable).sort(bySize)[0] ??
      viewable.slice().sort(bySize)[0]

    assignSeries('vp-0', primary.series_instance_uid)
  }, [study, engine, assignSeries])

  // One stack tool group for the whole grid.
  useEffect(() => {
    if (!engine || mprActive) return
    createStackToolGroup()
    setActiveTool(STACK_TOOL_GROUP, useViewerStore.getState().activeTool)
  }, [engine, mprActive, layout])

  useEffect(() => {
    if (!mprActive) setActiveTool(STACK_TOOL_GROUP, activeTool)
  }, [activeTool, mprActive])

  // Mirror Cornerstone's annotation state into the store.
  useEffect(() => {
    const sync = () => setMeasurements(collectMeasurements())
    sync()
    return onAnnotationsChanged(sync)
  }, [setMeasurements])

  // Keyboard shortcuts. Ignored while typing in the tag filter.
  //
  // The keys come from the translation catalogue, not from a constant: "W" for Window/Level is
  // a mnemonic that means nothing once the tool is called *Fenetrage*, and on an AZERTY layout
  // W and Z are not where a QWERTY user expects them.
  useEffect(() => {
    const shortcuts = new Map<string, ToolId>(
      TOOLBAR.map((id) => [t(`tools.${id}.key`).toLowerCase(), id]),
    )

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const tool = shortcuts.get(e.key.toLowerCase())
      if (tool) {
        e.preventDefault()
        selectTool(tool)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectTool, t])

  const activeSlot = viewports.find((v) => v.id === activeViewportId)
  const activeSeries = useMemo(
    () => study?.series.find((s) => s.series_instance_uid === activeSlot?.seriesUid),
    [study, activeSlot],
  )
  const mprSeries = useMemo(
    () => study?.series.find((s) => s.series_instance_uid === mprSeriesUid),
    [study, mprSeriesUid],
  )

  const activeViewport = () => handles.current[activeViewportId]?.viewport

  const actions: ToolbarActions = {
    applyPreset: useCallback((preset: WlPreset) => {
      const viewport = activeViewport()
      if (!viewport) return
      viewport.setProperties({ voiRange: toVoiRange(preset.width, preset.center) })
      viewport.render()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeViewportId]),

    invert: useCallback(() => {
      const viewport = activeViewport()
      if (!viewport) return
      viewport.setProperties({ invert: !viewport.getProperties().invert })
      viewport.render()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeViewportId]),

    // Rotation and flips are view *presentation*, not properties: setRotation is
    // protected, and setProperties has no rotation field.
    rotate: useCallback(() => {
      const viewport = activeViewport()
      if (!viewport) return
      const current = viewport.getViewPresentation().rotation ?? 0
      viewport.setViewPresentation({ rotation: (current + 90) % 360 })
      viewport.render()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeViewportId]),

    flipH: useCallback(() => {
      const viewport = activeViewport()
      if (!viewport) return
      const flipped = viewport.getViewPresentation().flipHorizontal ?? false
      viewport.setViewPresentation({ flipHorizontal: !flipped })
      viewport.render()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeViewportId]),

    flipV: useCallback(() => {
      const viewport = activeViewport()
      if (!viewport) return
      const flipped = viewport.getViewPresentation().flipVertical ?? false
      viewport.setViewPresentation({ flipVertical: !flipped })
      viewport.render()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeViewportId]),

    reset: useCallback(() => {
      const viewport = activeViewport()
      if (!viewport) return
      viewport.resetCamera()
      viewport.resetProperties?.()
      viewport.render()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeViewportId]),

    screenshot: useCallback(() => {
      const handle = handles.current[activeViewportId]
      if (!handle || !study) return
      const name = `${study.patient_name.replace(/\^/g, '_')}_${study.study_date ?? ''}_s${
        activeSeries?.series_number ?? 0
      }`
      void captureViewport(handle.viewport, handle.element, name)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeViewportId, study, activeSeries]),
  }

  function toggleMpr() {
    setMprError('')
    if (mprActive) {
      exitMpr()
    } else if (activeSeries?.is_reconstructable) {
      enterMpr(activeSeries.series_instance_uid)
    }
  }

  if (isLoading || !study || !engine) {
    return (
      <AppShell>
        <div className="flex h-full items-center justify-center text-ink-faint">
          <IconSpinner className="h-6 w-6" />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <ViewerToolbar
          activeSeries={mprActive ? mprSeries : activeSeries}
          actions={actions}
          onToggleMpr={toggleMpr}
        />

        {mprError && (
          <div className="flex items-center gap-2 border-b border-warn/40 bg-warn/10 px-3 py-1.5">
            <IconWarn className="h-3.5 w-3.5 shrink-0 text-warn" />
            <p className="text-2xs text-warn">{mprError}</p>
            <button
              type="button"
              className="ml-auto text-2xs text-warn hover:underline"
              onClick={() => {
                setMprError('')
                exitMpr()
              }}
            >
              {t('mpr.backTo2d')}
            </button>
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <SeriesPanel
            series={study.series}
            activeSeriesUid={mprActive ? mprSeriesUid : (activeSlot?.seriesUid ?? null)}
            onSelect={(uid) => {
              if (mprActive) exitMpr()
              assignSeries(activeViewportId, uid)
            }}
          />

          <div className="min-w-0 flex-1 bg-void">
            {mprActive && mprSeries ? (
              <MprView
                study={study}
                series={mprSeries}
                engine={engine}
                onError={(message) => {
                  setMprError(message)
                  exitMpr()
                }}
              />
            ) : (
              <div
                className="grid h-full gap-px bg-line"
                style={{
                  gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
                  gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
                }}
              >
                {viewports.map((slot) => (
                  <Viewport
                    key={slot.id}
                    slotId={slot.id}
                    seriesUid={slot.seriesUid}
                    study={study}
                    series={study.series.find(
                      (s) => s.series_instance_uid === slot.seriesUid,
                    )}
                    engine={engine}
                    active={slot.id === activeViewportId && viewports.length > 1}
                    onActivate={() => setActiveViewport(slot.id)}
                    onDropSeries={(uid) => assignSeries(slot.id, uid)}
                    onReady={(handle) => {
                      handles.current[slot.id] = handle
                    }}
                    onSopChange={(sop) => {
                      if (slot.id === activeViewportId) setInspectorSop(sop)
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {rightPanel && (
            <aside className="w-panel shrink-0 border-l border-line bg-panel">
              <ViewportOverlayPanels panel={rightPanel} sopUid={inspectorSopUid} />
            </aside>
          )}
        </div>
      </div>
    </AppShell>
  )
}
