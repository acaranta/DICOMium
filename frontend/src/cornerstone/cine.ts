// Cine playback: playing a stack as a movie.
//
// This needs no special case for multi-frame. `imageIds.ts` already expands every instance by
// NumberOfFrames into one imageId per frame, so a 406-frame ultrasound loop and a 406-slice CT
// arrive here as the same flat stack. Cornerstone's playClip reads `numScrollSteps` from
// `viewport.getImageIds().length` and advances through the same scroll path the mouse wheel
// uses — so one code path drives both.

import { utilities } from '@cornerstonejs/tools'
import { wadors } from '@cornerstonejs/dicom-image-loader'

/**
 * The fallback rate, for a stack that carries no timing at all — a plain CT or MR.
 *
 * Such a stack was never a "loop"; playing it is really automated scrolling, and this is a
 * comfortable speed to read at rather than anything the DICOM claims.
 */
export const DEFAULT_FPS = 15

/** Rates offered in the toolbar. `null` means "read it from the DICOM header". */
export const FPS_CHOICES = [null, 10, 15, 24, 30, 60] as const
export type FpsChoice = (typeof FPS_CHOICES)[number]

// Timing tags, in the order of authority. The first that answers wins.
const RECOMMENDED_DISPLAY_FRAME_RATE = '00082144' // what the modality says to play it at
const CINE_RATE = '00180040' // frames/sec of the original acquisition
const FRAME_TIME = '00181063' // ms per frame
const FRAME_TIME_VECTOR = '00181065' // per-frame ms, when the spacing is not uniform

type DicomJson = Record<string, { vr: string; Value?: unknown[] }>

/** Anything below 1 fps is a slideshow and anything above 60 outruns the display. */
function clampFps(fps: number): number {
  return Math.min(60, Math.max(1, fps))
}

function tagValues(header: DicomJson | undefined, tag: string): number[] {
  const raw = header?.[tag]?.Value
  if (!Array.isArray(raw)) return []
  return raw.map(Number).filter((n) => Number.isFinite(n) && n > 0)
}

/**
 * What the DICOM header says this stack should play at.
 *
 * Returns a frame rate, or a per-frame time vector when the spacing is not uniform (a cardiac
 * loop with a variable R-R interval), or nothing at all when the stack carries no timing.
 */
export function timingFromDicom(
  imageId: string | undefined,
): { fps: number } | { frameTimeVector: number[] } | null {
  if (!imageId) return null

  // The same manager imageIds.ts writes the full instance header into.
  const header = wadors.metaDataManager.get(imageId) as DicomJson | undefined
  if (!header) return null

  const [recommended] = tagValues(header, RECOMMENDED_DISPLAY_FRAME_RATE)
  if (recommended) return { fps: clampFps(recommended) }

  const [cineRate] = tagValues(header, CINE_RATE)
  if (cineRate) return { fps: clampFps(cineRate) }

  const vector = tagValues(header, FRAME_TIME_VECTOR)
  if (vector.length > 1) return { frameTimeVector: vector }

  const [frameTime] = tagValues(header, FRAME_TIME)
  if (frameTime) return { fps: clampFps(1000 / frameTime) }

  return null
}

/** The rate cine will actually use, for display in the toolbar. */
export function effectiveFps(imageId: string | undefined, chosen: FpsChoice): number {
  if (chosen !== null) return chosen

  const timing = timingFromDicom(imageId)
  if (timing && 'fps' in timing) return timing.fps
  if (timing && 'frameTimeVector' in timing) {
    // An average, purely so the toolbar has a number to show. Playback still uses the vector.
    const mean = timing.frameTimeVector.reduce((a, b) => a + b, 0) / timing.frameTimeVector.length
    return clampFps(1000 / mean)
  }
  return DEFAULT_FPS
}

/**
 * Start playing.
 *
 * `chosen === null` means Auto: honour whatever the DICOM asked for.
 *
 * The `frameTimeVector` branch deliberately omits `framesPerSecond`. Cornerstone's playClip
 * treats any `framesPerSecond` as an instruction to *ignore* the vector entirely
 * (`ignoreFrameTimeVector = true`), so passing both would silently discard the per-frame timing
 * we just went to the trouble of reading.
 */
export function play(
  element: HTMLDivElement,
  imageId: string | undefined,
  chosen: FpsChoice,
  frameCount: number,
): void {
  if (chosen === null) {
    const timing = timingFromDicom(imageId)

    // The vector only applies if it describes this exact stack; Cornerstone silently ignores a
    // mismatched one, which would leave playback running at its own default rate.
    if (timing && 'frameTimeVector' in timing && timing.frameTimeVector.length === frameCount) {
      utilities.cine.playClip(element, { frameTimeVector: timing.frameTimeVector, loop: true })
      return
    }
  }

  utilities.cine.playClip(element, {
    framesPerSecond: effectiveFps(imageId, chosen),
    loop: true,
  })
}

/**
 * Stop playing.
 *
 * Called on teardown as well as on pause. The interval lives outside React, so a viewport that
 * is disposed while playing would otherwise keep ticking against a dead element — the
 * `viewportId` is what lets Cornerstone find the state once the element itself is gone.
 */
export function stop(element: HTMLDivElement, viewportId?: string): void {
  try {
    utilities.cine.stopClip(element, { stopDynamicCine: true, viewportId })
  } catch {
    /* nothing was playing, or the element is already gone */
  }
}
