// One-time Cornerstone3D bootstrap. Everything else in src/cornerstone/ assumes this ran.
//
// The export names and call order below were read out of @cornerstonejs 5.5.0's own
// sources, not from a blog post. Two things that are NOT true of v5 despite what older
// guides say:
//
//   * There is no `addDicomWebInstance()`. Instance metadata is registered with
//     `wadors.metaDataManager.add(imageId, dicomJson)`.
//   * You do not call `registerDefaultProviders()` yourself — dicomImageLoaderInit()
//     already does it, via wadors/register.js.
//
// SharedArrayBuffer was removed in Cornerstone 2.x, so this app needs NO
// Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy headers. Do not add them.

import {
  init as coreInit,
  volumeLoader,
  cornerstoneStreamingImageVolumeLoader,
  cache,
} from '@cornerstonejs/core'
import { init as dicomImageLoaderInit } from '@cornerstonejs/dicom-image-loader'
import {
  init as toolsInit,
  addTool,
  PanTool,
  ZoomTool,
  WindowLevelTool,
  StackScrollTool,
  LengthTool,
  AngleTool,
  RectangleROITool,
  EllipticalROITool,
  ProbeTool,
  EraserTool,
  CrosshairsTool,
} from '@cornerstonejs/tools'

import { repaintAnnotationsOnLanguageChange } from './annotationText'

export const RENDERING_ENGINE_ID = 'dicomium-engine'

// A 512x512x400 16-bit CT is ~200 MB as a typed array, and the streaming loader holds
// both the per-frame image cache and the assembled volume. Cap it so a few large studies
// in one session cannot exhaust the tab.
const CACHE_BYTES = 3 * 1024 * 1024 * 1024

let initialized = false
let initPromise: Promise<void> | null = null

export function csInit(): Promise<void> {
  if (initialized) return Promise.resolve()
  // React 18 StrictMode double-invokes effects; without this guard addTool() would run
  // twice and throw.
  if (initPromise) return initPromise

  initPromise = (async () => {
    await coreInit()

    dicomImageLoaderInit({
      // Leave headroom: the main thread still has to render.
      maxWebWorkers: Math.max(1, Math.min((navigator.hardwareConcurrency ?? 4) - 1, 6)),
    })

    // The streaming volume loader lives inside core as of v5; the standalone
    // @cornerstonejs/streaming-image-volume-loader package no longer exists.
    volumeLoader.registerVolumeLoader(
      'cornerstoneStreamingImageVolume',
      cornerstoneStreamingImageVolumeLoader as never,
    )
    volumeLoader.registerUnknownVolumeLoader(cornerstoneStreamingImageVolumeLoader as never)

    await toolsInit()

    // Tools are registered in a global registry exactly once, then activated per
    // tool-group.
    for (const tool of [
      WindowLevelTool,
      PanTool,
      ZoomTool,
      StackScrollTool,
      LengthTool,
      AngleTool,
      RectangleROITool,
      EllipticalROITool,
      ProbeTool,
      EraserTool,
      CrosshairsTool,
    ]) {
      addTool(tool)
    }

    cache.setMaxCacheSize(CACHE_BYTES)

    // Existing measurements must be relabelled when the language changes; Cornerstone will not
    // rebuild their text on its own.
    repaintAnnotationsOnLanguageChange()

    initialized = true
  })()

  return initPromise
}

export function isInitialized(): boolean {
  return initialized
}
