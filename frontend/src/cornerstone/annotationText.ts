// The text Cornerstone draws ON the image.
//
// Cornerstone renders annotation labels into its own SVG layer, not into our React tree, so
// `t()` never reaches them: a French user would get a French side panel and an English
// "Area: 7731 mm² / Mean: -681 HU" burned onto the scan next to it.
//
// Every annotation tool takes a `getTextLines` in its configuration, so we supply our own —
// translated, and with the numbers run through Intl rather than Cornerstone's roundNumber
// (which always emits a dot: `129.4 mm` where French must read `129,4 mm`).
//
// The UNITS come from Cornerstone itself (`HU`, `mm`, `mm²`) and are passed straight through.
// They are not translated: HU is an eponym, and mm/mm² are SI.

import { getRenderingEngines } from '@cornerstonejs/core'
import { annotation } from '@cornerstonejs/tools'
import i18n from '../lib/i18n'
import { formatNumber } from '../lib/format'

/** One entry of Cornerstone's `cachedStats`, as much of it as we read. */
interface Stats {
  area?: number
  areaUnit?: string
  mean?: number
  stdDev?: number
  min?: number
  max?: number
  length?: number
  unit?: string
  angle?: number
  value?: number | number[]
  index?: number[]
  modalityUnit?: string | string[]
  isEmptyArea?: boolean
}

interface AnnotationData {
  cachedStats: Record<string, Stats>
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * A stat's label, from the same catalogue the side panel uses — so the two always agree.
 *
 * Capitalised for the canvas: the panel renders these as a compact lowercase stat list, but on
 * the image they head a sentence, and every other viewer writes "Area:", not "area:". Done with
 * toLocaleUpperCase so "écart-type" becomes "Écart-type" and not something mangled.
 */
function label(key: string): string {
  const text = i18n.t(`measurements.stats.${key}`, { ns: 'viewer' })
  const locale = i18n.resolvedLanguage
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1)
}

/**
 * Cornerstone rounds to a sensible number of decimals depending on magnitude. We keep that
 * behaviour (a 7731 mm² area with one decimal would be noise) but render it in the locale.
 */
function round(value: number): string {
  const digits = Math.abs(value) >= 100 ? 0 : 1
  return formatNumber(value, digits)
}

const stat = (key: string, value: number, unit?: string) =>
  `${label(key)}: ${round(value)}${unit ? ` ${unit}` : ''}`

/** Area, mean, max, min, SD — shared by the rectangle and ellipse ROIs. */
function roiTextLines(data: AnnotationData, targetId: string): string[] {
  const s = data.cachedStats?.[targetId]
  if (!s) return []

  const lines: string[] = []

  if (isNumber(s.area)) {
    lines.push(
      s.isEmptyArea
        ? i18n.t('measurements.obliqueUnsupported', { ns: 'viewer' })
        : stat('area', s.area, s.areaUnit),
    )
  }

  const unit = typeof s.modalityUnit === 'string' ? s.modalityUnit : undefined
  if (isNumber(s.mean)) lines.push(stat('mean', s.mean, unit))
  if (isNumber(s.max)) lines.push(stat('max', s.max, unit))
  if (isNumber(s.min)) lines.push(stat('min', s.min, unit))
  if (isNumber(s.stdDev)) lines.push(stat('SD', s.stdDev, unit))

  return lines
}

function lengthTextLines(data: AnnotationData, targetId: string): string[] | undefined {
  const s = data.cachedStats?.[targetId]
  if (!s || !isNumber(s.length)) return undefined
  // No label — the line itself says what it is. Only the number needs localising.
  return [`${round(s.length)} ${s.unit ?? 'mm'}`]
}

function angleTextLines(data: AnnotationData, targetId: string): string[] | undefined {
  const s = data.cachedStats?.[targetId]
  if (!s || !isNumber(s.angle)) return undefined
  return [`${round(s.angle)} °`]
}

function probeTextLines(data: AnnotationData, targetId: string): string[] | undefined {
  const s = data.cachedStats?.[targetId]
  if (!s || s.value === undefined || !s.index) return undefined

  const lines = [`(${s.index.join(', ')})`]

  if (Array.isArray(s.value) && Array.isArray(s.modalityUnit)) {
    s.value.forEach((v, i) => lines.push(`${round(v)} ${s.modalityUnit![i]}`))
  } else if (isNumber(s.value)) {
    lines.push(`${round(s.value)} ${typeof s.modalityUnit === 'string' ? s.modalityUnit : ''}`.trim())
  }

  return lines
}

/** The configuration to hand each annotation tool when it is added to a tool group. */
export const ANNOTATION_TEXT_CONFIG: Record<string, { getTextLines: unknown }> = {
  Length: { getTextLines: lengthTextLines },
  Angle: { getTextLines: angleTextLines },
  RectangleROI: { getTextLines: roiTextLines },
  EllipticalROI: { getTextLines: roiTextLines },
  Probe: { getTextLines: probeTextLines },
}

/**
 * Repaint existing annotations when the language changes.
 *
 * `getTextLines` runs at render time, but Cornerstone only rebuilds the label of an annotation
 * it considers stale. Without this, a user who switches language mid-session keeps their
 * existing measurements labelled in the language they just left — which looks like the switch
 * half failed. Marking them invalidated forces the labels to be rebuilt.
 */
export function repaintAnnotationsOnLanguageChange(): void {
  i18n.on('languageChanged', () => {
    const annotations = annotation.state.getAnnotationManager().getAllAnnotations() ?? []
    for (const a of annotations) a.invalidated = true

    for (const engine of getRenderingEngines() ?? []) engine?.render()
  })
}
