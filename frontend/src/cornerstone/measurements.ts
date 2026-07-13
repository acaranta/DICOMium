// Mirroring Cornerstone's annotation state into the store, and formatting the stats.
//
// ROI statistics come from the default calculator as a NamedStatistics object with
// mean / min / max / stdDev / area. For a CT they are in Hounsfield units, because the
// modality LUT (rescale slope/intercept) has already been applied.

import { annotation, Enums as ToolEnums } from '@cornerstonejs/tools'
import { eventTarget } from '@cornerstonejs/core'
import type { Measurement } from '../store/viewerStore'

const { Events } = ToolEnums

/** cachedStats is mostly numbers, but modalityUnit ("HU") is a string. */
type CachedStats = Record<string, number | string | undefined>

type AnyAnnotation = {
  annotationUID?: string
  metadata?: { toolName?: string; referencedImageId?: string }
  data?: {
    cachedStats?: Record<string, CachedStats>
    handles?: unknown
    label?: string
    text?: string
  }
}

function fmt(value: unknown, digits = 1): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  return value.toFixed(digits)
}

function unitOf(stats: CachedStats): string | undefined {
  // Cornerstone reports "HU" here once the modality LUT has been applied, which is the
  // quickest confirmation that rescale slope/intercept reached the viewer intact.
  return typeof stats.modalityUnit === 'string' ? stats.modalityUnit : undefined
}

/** One labelled number, e.g. { key: 'mean', value: '-410', unit: 'HU' }. */
export interface Stat {
  key: string
  value: string
  unit?: string
}

/**
 * Turn one annotation's cachedStats into labelled numbers.
 *
 * Returned as discrete stats rather than a joined string so the panel can lay them out
 * in a grid — a single string wraps mid-word ("min -923 m / ax 691"), which is both ugly
 * and genuinely hard to read at a glance.
 */
function describe(a: AnyAnnotation): Stat[] {
  const tool = a.metadata?.toolName ?? ''
  const stats: CachedStats = Object.values(a.data?.cachedStats ?? {})[0] ?? {}
  const unit = unitOf(stats)

  switch (tool) {
    case 'Length':
      return [{ key: 'length', value: fmt(stats.length), unit: 'mm' }]

    case 'Angle':
      return [{ key: 'angle', value: fmt(stats.angle), unit: '°' }]

    case 'RectangleROI':
    case 'EllipticalROI': {
      const out: Stat[] = [
        { key: 'mean', value: fmt(stats.mean), unit },
        { key: 'SD', value: fmt(stats.stdDev), unit },
        { key: 'min', value: fmt(stats.min, 0), unit },
        { key: 'max', value: fmt(stats.max, 0), unit },
      ]
      if (typeof stats.area === 'number') {
        out.push({ key: 'area', value: fmt(stats.area, 0), unit: 'mm²' })
      }
      return out
    }

    case 'Probe':
      return [{ key: 'value', value: fmt(stats.value), unit }]

    default:
      return []
  }
}

const LABELS: Record<string, string> = {
  Length: 'Length',
  Angle: 'Angle',
  RectangleROI: 'Rect ROI',
  EllipticalROI: 'Ellipse ROI',
  Probe: 'Probe',
}

export function collectMeasurements(): Measurement[] {
  const manager = annotation.state.getAnnotationManager()
  const all = manager.getAllAnnotations() as AnyAnnotation[]

  return all
    .filter((a) => a.annotationUID && LABELS[a.metadata?.toolName ?? ''])
    .map((a) => ({
      uid: a.annotationUID as string,
      toolName: a.metadata?.toolName ?? '',
      label: LABELS[a.metadata?.toolName ?? ''] ?? 'Measurement',
      stats: describe(a),
      imageId: a.metadata?.referencedImageId,
    }))
}

export function removeMeasurement(uid: string) {
  annotation.state.removeAnnotation(uid)
}

export function removeAllMeasurements() {
  for (const m of collectMeasurements()) annotation.state.removeAnnotation(m.uid)
}

/**
 * Subscribe to annotation changes.
 *
 * MODIFIED fires continuously while a handle is dragged, so the callback must be cheap —
 * it is, because it only rebuilds a small array of strings.
 */
export function onAnnotationsChanged(callback: () => void): () => void {
  const events = [
    Events.ANNOTATION_ADDED,
    Events.ANNOTATION_MODIFIED,
    Events.ANNOTATION_REMOVED,
    Events.ANNOTATION_COMPLETED,
  ]
  for (const event of events) eventTarget.addEventListener(event, callback)
  return () => {
    for (const event of events) eventTarget.removeEventListener(event, callback)
  }
}
