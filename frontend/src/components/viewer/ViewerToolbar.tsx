import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Series } from '../../lib/api'
import { LAYOUTS, useViewerStore } from '../../store/viewerStore'
import { TOOLBAR, type ToolId } from '../../cornerstone/tools'
import { presetsFor, type WlPreset } from '../../cornerstone/wlPresets'
import { MAX_MPR_INSTANCES } from '../../cornerstone/volume'
import {
  IconAngle,
  IconBack,
  IconCamera,
  IconChevron,
  IconCube,
  IconEllipseRoi,
  IconEraser,
  IconInvert,
  IconLength,
  IconPan,
  IconProbe,
  IconRectRoi,
  IconReset,
  IconRotate,
  IconRuler,
  IconTag,
  IconWindowLevel,
  IconZoom,
  IconFlipH,
  IconFlipV,
} from '../ui/Icons'

const TOOL_ICONS: Record<ToolId, (p: { className?: string }) => JSX.Element> = {
  windowLevel: IconWindowLevel,
  pan: IconPan,
  zoom: IconZoom,
  length: IconLength,
  angle: IconAngle,
  rectangleRoi: IconRectRoi,
  ellipseRoi: IconEllipseRoi,
  probe: IconProbe,
  eraser: IconEraser,
}

export interface ToolbarActions {
  applyPreset: (preset: WlPreset) => void
  invert: () => void
  rotate: () => void
  flipH: () => void
  flipV: () => void
  reset: () => void
  screenshot: () => void
}

export default function ViewerToolbar({
  activeSeries,
  actions,
  onToggleMpr,
}: {
  activeSeries: Series | undefined
  actions: ToolbarActions
  onToggleMpr: () => void
}) {
  const { activeTool, setActiveTool, layout, setLayout, mprActive, rightPanel, setRightPanel } =
    useViewerStore()
  const [presetsOpen, setPresetsOpen] = useState(false)
  const [layoutOpen, setLayoutOpen] = useState(false)

  const presets = presetsFor(activeSeries?.modality ?? '')

  // MPR needs a regular volume. The reason is spelled out in the tooltip rather than
  // leaving a mysteriously dead button.
  const tooBig = (activeSeries?.mpr_instance_count ?? 0) > MAX_MPR_INSTANCES
  const canMpr = !!activeSeries?.is_reconstructable && !tooBig
  const mprReason = !activeSeries
    ? 'Load a series first'
    : !activeSeries.is_reconstructable
      ? 'This series is not a regular 3D stack (too few slices, mixed orientations, or uneven spacing)'
      : tooBig
        ? `Too large to reconstruct (${activeSeries.mpr_instance_count} slices)`
        : `Reconstruct in 3 planes (${activeSeries.mpr_instance_count} slices)`

  return (
    <div className="flex h-11 shrink-0 items-center gap-0.5 border-b border-line bg-panel px-2">
      <Link to="/" className="tool-btn" title="Back to the study list">
        <IconBack />
      </Link>

      <div className="divider" />

      {TOOLBAR.map((tool) => {
        const Icon = TOOL_ICONS[tool.id]
        return (
          <button
            key={tool.id}
            type="button"
            className="tool-btn"
            data-active={activeTool === tool.id && !mprActive}
            disabled={mprActive && tool.id === 'eraser'}
            onClick={() => setActiveTool(tool.id)}
            title={`${tool.label} — ${tool.hint}  (${tool.key.toUpperCase()})`}
          >
            <Icon />
          </button>
        )
      })}

      <div className="divider" />

      {/* Window/level presets — CT only; they are defined in Hounsfield units. */}
      <div className="relative">
        <button
          type="button"
          className="btn h-8 gap-1 px-2"
          disabled={!presets.length}
          onClick={() => setPresetsOpen((v) => !v)}
          onBlur={() => setTimeout(() => setPresetsOpen(false), 120)}
          title={presets.length ? 'Window presets' : 'Presets are defined for CT only'}
        >
          <span className="text-2xs">Presets</span>
          <IconChevron className="h-3 w-3" />
        </button>

        {presetsOpen && presets.length > 0 && (
          <div className="absolute left-0 top-9 z-50 w-44 rounded border border-line bg-raised py-1 shadow-xl">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                className="flex w-full items-baseline justify-between px-3 py-1.5 text-left text-xs text-ink hover:bg-hover"
                onMouseDown={() => {
                  actions.applyPreset(p)
                  setPresetsOpen(false)
                }}
              >
                <span>{p.label}</span>
                <span className="num text-2xs text-ink-faint">
                  {p.width}/{p.center}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          className="btn h-8 gap-1 px-2"
          disabled={mprActive}
          onClick={() => setLayoutOpen((v) => !v)}
          onBlur={() => setTimeout(() => setLayoutOpen(false), 120)}
          title="Viewport layout"
        >
          <span className="num text-2xs">
            {layout.rows}×{layout.cols}
          </span>
          <IconChevron className="h-3 w-3" />
        </button>

        {layoutOpen && (
          <div className="absolute left-0 top-9 z-50 w-28 rounded border border-line bg-raised py-1 shadow-xl">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                type="button"
                className="w-full px-3 py-1.5 text-left num text-xs text-ink hover:bg-hover"
                onMouseDown={() => {
                  setLayout(l.layout)
                  setLayoutOpen(false)
                }}
              >
                {l.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="divider" />

      <button type="button" className="tool-btn" onClick={actions.invert} title="Invert greyscale">
        <IconInvert />
      </button>
      <button type="button" className="tool-btn" onClick={actions.rotate} title="Rotate 90°">
        <IconRotate />
      </button>
      <button type="button" className="tool-btn" onClick={actions.flipH} title="Flip horizontally">
        <IconFlipH />
      </button>
      <button type="button" className="tool-btn" onClick={actions.flipV} title="Flip vertically">
        <IconFlipV />
      </button>
      <button type="button" className="tool-btn" onClick={actions.reset} title="Reset view">
        <IconReset />
      </button>
      <button type="button" className="tool-btn" onClick={actions.screenshot} title="Save as PNG">
        <IconCamera />
      </button>

      <div className="divider" />

      <button
        type="button"
        className="tool-btn"
        data-active={mprActive}
        disabled={!canMpr && !mprActive}
        onClick={onToggleMpr}
        title={mprActive ? 'Leave MPR' : mprReason}
      >
        <IconCube />
      </button>

      <div className="flex-1" />

      <button
        type="button"
        className="tool-btn"
        data-active={rightPanel === 'measurements'}
        onClick={() => setRightPanel(rightPanel === 'measurements' ? null : 'measurements')}
        title="Measurements"
      >
        <IconRuler />
      </button>
      <button
        type="button"
        className="tool-btn"
        data-active={rightPanel === 'tags'}
        onClick={() => setRightPanel(rightPanel === 'tags' ? null : 'tags')}
        title="DICOM tags"
      >
        <IconTag />
      </button>
    </div>
  )
}
