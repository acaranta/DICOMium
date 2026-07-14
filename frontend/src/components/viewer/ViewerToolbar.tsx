import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Series } from '../../lib/api'
import { LAYOUTS, useViewerStore } from '../../store/viewerStore'
import { TOOLBAR, type ToolId } from '../../cornerstone/tools'
import { effectiveFps, FPS_CHOICES, type FpsChoice } from '../../cornerstone/cine'
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
  IconPause,
  IconPlay,
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
  toggleCine: () => void
  setCineFps: (fps: FpsChoice) => void
}

export default function ViewerToolbar({
  activeSeries,
  activeImageId,
  actions,
  onToggleMpr,
}: {
  activeSeries: Series | undefined
  /** An imageId from the active viewport — cine reads its DICOM header for the frame rate. */
  activeImageId: string | undefined
  actions: ToolbarActions
  onToggleMpr: () => void
}) {
  const { t } = useTranslation('viewer')
  const {
    activeTool,
    setActiveTool,
    layout,
    setLayout,
    mprActive,
    rightPanel,
    setRightPanel,
    activeViewportId,
    playing: playingSlots,
    cineFps,
  } = useViewerStore()
  const [presetsOpen, setPresetsOpen] = useState(false)
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [fpsOpen, setFpsOpen] = useState(false)

  const presets = presetsFor(activeSeries?.modality ?? '')

  // A single image cannot be played, and MPR is a volume viewport — a different playback
  // context that this button does not drive.
  const frameCount = activeSeries?.num_frames_total ?? 0
  const canPlay = !mprActive && frameCount > 1
  const playing = !!playingSlots[activeViewportId]

  const autoFps = effectiveFps(activeImageId, null)
  const shownFps = cineFps ?? autoFps

  // MPR needs a regular volume. The reason is spelled out in the tooltip rather than leaving a
  // mysteriously dead button.
  const tooBig = (activeSeries?.mpr_instance_count ?? 0) > MAX_MPR_INSTANCES
  const canMpr = !!activeSeries?.is_reconstructable && !tooBig
  const mprReason = !activeSeries
    ? t('mpr.needSeries')
    : !activeSeries.is_reconstructable
      ? t('mpr.notReconstructable')
      : tooBig
        ? t('mpr.tooLarge', { count: activeSeries.mpr_instance_count })
        : t('mpr.enter', { count: activeSeries.mpr_instance_count })

  return (
    <div className="flex h-11 shrink-0 items-center gap-0.5 border-b border-line bg-panel px-2">
      <Link to="/" className="tool-btn" title={t('back')}>
        <IconBack />
      </Link>

      <div className="divider" />

      {TOOLBAR.map((id) => {
        const Icon = TOOL_ICONS[id]
        const label = t(`tools.${id}.label`)
        const hint = t(`tools.${id}.hint`)
        // The shortcut is translated too: "W" for Window/Level is a mnemonic that means nothing
        // once the tool is called *Fenêtrage*.
        const key = t(`tools.${id}.key`)

        return (
          <button
            key={id}
            type="button"
            className="tool-btn"
            data-active={activeTool === id && !mprActive}
            disabled={mprActive && id === 'eraser'}
            onClick={() => setActiveTool(id)}
            title={`${label} — ${hint}  (${key.toUpperCase()})`}
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
          title={presets.length ? t('toolbar.presetsCtOnly') : t('toolbar.presetsDisabled')}
        >
          <span className="text-2xs">{t('toolbar.presets')}</span>
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
                <span>{t(`presets.${p.id}`)}</span>
                {/* Hounsfield width/centre — universal, not localised. */}
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
          title={t('toolbar.layout')}
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

      {/* Cine. A stack of one is a picture, not a loop — and MPR is a volume viewport, which is
          a different playback context entirely. */}
      <button
        type="button"
        className="tool-btn"
        data-active={playing}
        disabled={!canPlay}
        onClick={actions.toggleCine}
        title={
          canPlay
            ? `${playing ? t('cine.pause') : t('cine.play')}  (${t('cine.keyLabel')})`
            : t('cine.notPlayable')
        }
      >
        {playing ? <IconPause /> : <IconPlay />}
      </button>

      <div className="relative">
        <button
          type="button"
          className="btn h-8 gap-1 px-2"
          disabled={!canPlay}
          onClick={() => setFpsOpen((v) => !v)}
          onBlur={() => setTimeout(() => setFpsOpen(false), 120)}
          title={t('cine.speed')}
        >
          {/* Always the rate that will actually be used, so "Auto" is never a mystery. */}
          <span className="num text-2xs">{t('cine.fps', { count: shownFps })}</span>
          <IconChevron className="h-3 w-3" />
        </button>

        {fpsOpen && (
          <div className="absolute left-0 top-9 z-50 w-32 rounded border border-line bg-raised py-1 shadow-xl">
            {FPS_CHOICES.map((choice) => (
              <button
                key={choice ?? 'auto'}
                type="button"
                className={`flex w-full items-baseline justify-between px-3 py-1.5 text-left text-xs hover:bg-hover ${
                  choice === cineFps ? 'text-accent' : 'text-ink'
                }`}
                onMouseDown={() => {
                  actions.setCineFps(choice)
                  setFpsOpen(false)
                }}
              >
                {choice === null ? (
                  <>
                    <span>{t('cine.auto')}</span>
                    {/* What Auto resolves to for THIS series, read from its DICOM header. */}
                    <span className="num text-2xs text-ink-faint">
                      {t('cine.fps', { count: autoFps })}
                    </span>
                  </>
                ) : (
                  <span className="num">{t('cine.fps', { count: choice })}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="divider" />

      <button type="button" className="tool-btn" onClick={actions.invert} title={t('toolbar.invert')}>
        <IconInvert />
      </button>
      <button type="button" className="tool-btn" onClick={actions.rotate} title={t('toolbar.rotate')}>
        <IconRotate />
      </button>
      <button type="button" className="tool-btn" onClick={actions.flipH} title={t('toolbar.flipH')}>
        <IconFlipH />
      </button>
      <button type="button" className="tool-btn" onClick={actions.flipV} title={t('toolbar.flipV')}>
        <IconFlipV />
      </button>
      <button type="button" className="tool-btn" onClick={actions.reset} title={t('toolbar.reset')}>
        <IconReset />
      </button>
      <button
        type="button"
        className="tool-btn"
        onClick={actions.screenshot}
        title={t('toolbar.screenshot')}
      >
        <IconCamera />
      </button>

      <div className="divider" />

      <button
        type="button"
        className="tool-btn"
        data-active={mprActive}
        disabled={!canMpr && !mprActive}
        onClick={onToggleMpr}
        title={mprActive ? t('mpr.leave') : mprReason}
      >
        <IconCube />
      </button>

      <div className="flex-1" />

      <button
        type="button"
        className="tool-btn"
        data-active={rightPanel === 'measurements'}
        onClick={() => setRightPanel(rightPanel === 'measurements' ? null : 'measurements')}
        title={t('toolbar.measurements')}
      >
        <IconRuler />
      </button>
      <button
        type="button"
        className="tool-btn"
        data-active={rightPanel === 'tags'}
        onClick={() => setRightPanel(rightPanel === 'tags' ? null : 'tags')}
        title={t('toolbar.tags')}
      >
        <IconTag />
      </button>
    </div>
  )
}
