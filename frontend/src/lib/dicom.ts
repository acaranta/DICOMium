// Formatting DICOM's peculiar value representations for humans.

/** PersonName: "DOE^JOHN^^^" -> "DOE, JOHN". Components are ^-separated and often padded. */
export function formatPersonName(pn: string | null | undefined): string {
  if (!pn) return 'Unknown'
  const [family = '', given = '', middle = ''] = pn.split('^')
  const names = [family.trim(), [given.trim(), middle.trim()].filter(Boolean).join(' ')]
    .filter(Boolean)
  return names.length ? names.join(', ') : 'Unknown'
}

/** DA: "20210315" -> "15 Mar 2021". */
export function formatDate(da: string | null | undefined): string {
  if (!da || da.length < 8) return '—'
  const year = da.slice(0, 4)
  const month = Number(da.slice(4, 6))
  const day = da.slice(6, 8)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const name = months[month - 1]
  if (!name) return da
  return `${day} ${name} ${year}`
}

/** TM: "195512.000000" -> "19:55". */
export function formatTime(tm: string | null | undefined): string {
  if (!tm || tm.length < 4) return ''
  return `${tm.slice(0, 2)}:${tm.slice(2, 4)}`
}

/** Age from a DA birth date, as radiologists write it: "042Y". */
export function formatAge(birthDate: string | null | undefined, studyDate: string | null | undefined): string {
  if (!birthDate || birthDate.length < 8 || !studyDate || studyDate.length < 8) return ''
  const born = new Date(+birthDate.slice(0, 4), +birthDate.slice(4, 6) - 1, +birthDate.slice(6, 8))
  const at = new Date(+studyDate.slice(0, 4), +studyDate.slice(4, 6) - 1, +studyDate.slice(6, 8))
  let years = at.getFullYear() - born.getFullYear()
  const m = at.getMonth() - born.getMonth()
  if (m < 0 || (m === 0 && at.getDate() < born.getDate())) years--
  return years >= 0 && years < 150 ? `${String(years).padStart(3, '0')}Y` : ''
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`
}

/** A stable colour per modality, for thumbnail placeholders and badges. */
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

export function seriesLabel(s: { series_number: number | null; series_description: string | null }): string {
  const num = s.series_number != null ? `${s.series_number}` : '—'
  return s.series_description ? `${num} · ${s.series_description}` : num
}
