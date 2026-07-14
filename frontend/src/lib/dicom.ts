// DICOM's peculiar value representations.
//
// Date, number and byte formatting used to live here, with twelve hardcoded English month
// abbreviations. They now live in lib/format.ts, behind Intl. What is left is the part that is
// genuinely about DICOM rather than about English.

/** PersonName: "DOE^JOHN^^^" -> "DOE, JOHN". Components are ^-separated and often padded. */
export function formatPersonName(pn: string | null | undefined, unknown = 'Unknown'): string {
  if (!pn) return unknown

  const [family = '', given = '', middle = ''] = pn.split('^')
  const names = [family.trim(), [given.trim(), middle.trim()].filter(Boolean).join(' ')].filter(
    Boolean,
  )
  return names.length ? names.join(', ') : unknown
}

/**
 * Age as radiologists write it: "042Y".
 *
 * This is the DICOM `AS` value representation, not prose — it is "042Y" in every language and
 * is deliberately NOT localised.
 */
export function formatAge(
  birthDate: string | null | undefined,
  studyDate: string | null | undefined,
): string {
  if (!birthDate || birthDate.length < 8 || !studyDate || studyDate.length < 8) return ''

  const born = new Date(+birthDate.slice(0, 4), +birthDate.slice(4, 6) - 1, +birthDate.slice(6, 8))
  const at = new Date(+studyDate.slice(0, 4), +studyDate.slice(4, 6) - 1, +studyDate.slice(6, 8))

  let years = at.getFullYear() - born.getFullYear()
  const m = at.getMonth() - born.getMonth()
  if (m < 0 || (m === 0 && at.getDate() < born.getDate())) years--

  return years >= 0 && years < 150 ? `${String(years).padStart(3, '0')}Y` : ''
}

/** TM: "195512.000000" -> "19:55". */
export function formatTime(tm: string | null | undefined): string {
  if (!tm || tm.length < 4) return ''
  return `${tm.slice(0, 2)}:${tm.slice(2, 4)}`
}

/**
 * A stable colour per modality.
 *
 * The KEYS are DICOM Defined Terms (CT, MR, US…), not English words. They are never translated
 * — a French radiologist reads "CT", not "TDM", on a DICOM badge.
 */
export function modalityColor(modality: string): string {
  const map: Record<string, string> = {
    CT: 'text-sky-400',
    MR: 'text-violet-400',
    CR: 'text-emerald-400',
    DX: 'text-emerald-400',
    US: 'text-amber-400',
    PT: 'text-orange-400',
    NM: 'text-orange-400',
    XA: 'text-rose-400',
    MG: 'text-pink-400',
    SR: 'text-ink-faint',
  }
  return map[modality] ?? 'text-ink-dim'
}
