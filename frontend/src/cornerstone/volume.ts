// MPR: building a volume and wiring the three orthogonal viewports.

import {
  Enums,
  RenderingEngine,
  cache,
  setVolumesForViewports,
  volumeLoader,
  type Types,
} from '@cornerstonejs/core'
import { synchronizers } from '@cornerstonejs/tools'
import { addViewports, createMprToolGroup, MPR_TOOL_GROUP, setCrosshairsActive } from './toolGroups'

const { ViewportType, OrientationAxis } = Enums

export const MPR_VIEWPORTS = ['mpr-axial', 'mpr-sagittal', 'mpr-coronal'] as const
export const MPR_ORIENTATIONS = {
  'mpr-axial': OrientationAxis.AXIAL,
  'mpr-sagittal': OrientationAxis.SAGITTAL,
  'mpr-coronal': OrientationAxis.CORONAL,
} as const

const SLAB_SYNC_ID = 'webdicom-slab-sync'

export function volumeIdFor(seriesUid: string): string {
  return `cornerstoneStreamingImageVolume:${seriesUid}`
}

export interface MprHandles {
  volumeId: string
  destroy: () => void
}

/**
 * Build the volume and mount it into three orthographic viewports.
 *
 * `imageIds` must already be filtered to a single orientation — see imageIds.ts. Passing
 * a series that mixes orientations makes createAndCacheVolume throw.
 */
export async function setupMpr(
  renderingEngine: RenderingEngine,
  seriesUid: string,
  imageIds: string[],
  elements: Record<string, HTMLDivElement>,
): Promise<MprHandles> {
  const volumeId = volumeIdFor(seriesUid)

  renderingEngine.setViewports(
    MPR_VIEWPORTS.map((id) => ({
      viewportId: id,
      type: ViewportType.ORTHOGRAPHIC,
      element: elements[id],
      defaultOptions: {
        orientation: MPR_ORIENTATIONS[id],
        background: [0, 0, 0] as Types.Point3,
      },
    })),
  )

  const volume = await volumeLoader.createAndCacheVolume(volumeId, { imageIds })
  // Streams in the background; the viewports render progressively as slices arrive.
  ;(volume as { load: () => void }).load()

  await setVolumesForViewports(renderingEngine, [{ volumeId }], [...MPR_VIEWPORTS])

  createMprToolGroup()
  // Order matters: the crosshairs tool computes reference lines from the viewports in
  // its group, so they must be added BEFORE it is activated.
  addViewports(MPR_TOOL_GROUP, [...MPR_VIEWPORTS])
  setCrosshairsActive(MPR_TOOL_GROUP, true)

  const sync = synchronizers.createSlabThicknessSynchronizer(SLAB_SYNC_ID)
  for (const viewportId of MPR_VIEWPORTS) {
    sync.add({ renderingEngineId: renderingEngine.id, viewportId })
  }

  renderingEngine.renderViewports([...MPR_VIEWPORTS])

  return {
    volumeId,
    destroy: () => {
      try {
        sync.destroy()
      } catch {
        /* already gone */
      }
      // Purge the volume or the cache holds ~200 MB per study across MPR toggles.
      cache.removeVolumeLoadObject(volumeId)
    },
  }
}

/** Guard the MPR button: a volume this big will stall the tab before it renders. */
export const MAX_MPR_INSTANCES = 2000
