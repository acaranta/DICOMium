// Turning a series into Cornerstone imageIds.
//
// Deliberately hand-rolled instead of pulling in `dicomweb-client`: we need explicit
// control over multi-frame expansion, and one fewer dependency in a bundle this size is
// worth having.

import { wadors } from '@cornerstonejs/dicom-image-loader'

/** Absolute, not path-relative — the loader's XHR resolves imageIds against no base. */
export const WADO_ROOT = `${window.location.origin}/dicomweb`

/** One instance's DICOM JSON, as WADO-RS returns it (hex tag keys). */
type DicomJson = Record<string, { vr: string; Value?: unknown[] }>

const SOP_INSTANCE_UID = '00080018'
const NUMBER_OF_FRAMES = '00280008'

export interface SeriesImageIds {
  imageIds: string[]
  /** The subset forming a regular volume — MPR must use these, not `imageIds`. */
  volumeImageIds: string[]
}

function firstValue(instance: DicomJson, tag: string): unknown {
  return instance[tag]?.Value?.[0]
}

/**
 * Fetch a series' metadata, register it with the loader, and return its imageIds.
 *
 * The backend returns instances already ordered by (InstanceNumber, SOPInstanceUID), and
 * that order IS the slice order the viewer shows — we must not re-sort here.
 *
 * `volumeSopUids`, when given, is the set of instances that form a regular volume. A
 * reformat series often embeds a few off-plane reference images; they belong in the 2D
 * stack but must be kept out of the volume, because the volume loader throws on mixed
 * orientations. The backend decides this at ingest (see geometry.py) — we do not
 * re-derive it here.
 */
export async function loadSeriesImageIds(
  studyUid: string,
  seriesUid: string,
  volumeSopUids?: Set<string> | null,
): Promise<SeriesImageIds> {
  const res = await fetch(
    `${WADO_ROOT}/studies/${studyUid}/series/${seriesUid}/metadata`,
    { credentials: 'include', headers: { Accept: 'application/dicom+json' } },
  )
  if (!res.ok) throw new Error(`Could not load series metadata (${res.status})`)

  const instances: DicomJson[] = await res.json()
  const imageIds: string[] = []
  const volumeImageIds: string[] = []

  for (const instance of instances) {
    const sop = firstValue(instance, SOP_INSTANCE_UID) as string | undefined
    if (!sop) continue

    const frames = Number(firstValue(instance, NUMBER_OF_FRAMES) ?? 1) || 1
    const base = `wadors:${WADO_ROOT}/studies/${studyUid}/series/${seriesUid}/instances/${sop}/frames/`
    const inVolume = !volumeSopUids || volumeSopUids.has(sop)

    for (let frame = 1; frame <= frames; frame++) {
      const imageId = base + frame
      // The loader needs the instance's DICOM JSON before it will load the frame; this
      // is what feeds rescale slope/intercept, window centre/width and pixel geometry to
      // the metadata providers.
      wadors.metaDataManager.add(imageId, instance as never)
      imageIds.push(imageId)
      if (inVolume) volumeImageIds.push(imageId)
    }
  }

  return { imageIds, volumeImageIds }
}

/** Ask the backend which instances belong to the MPR volume. Returns null when they all
 *  do, so the caller can skip filtering entirely. */
export async function fetchVolumeSopUids(seriesUid: string): Promise<Set<string> | null> {
  const res = await fetch(`/api/series/${seriesUid}/instances`, { credentials: 'include' })
  if (!res.ok) return null

  const instances: { sop_instance_uid: string; in_mpr_volume: boolean }[] = await res.json()
  if (instances.every((i) => i.in_mpr_volume)) return null

  return new Set(instances.filter((i) => i.in_mpr_volume).map((i) => i.sop_instance_uid))
}
