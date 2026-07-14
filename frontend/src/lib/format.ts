// Locale-aware formatting.
//
// Before this existed, every number went through `toFixed()` and every date through a table of
// twelve hardcoded English month abbreviations. That is not a cosmetic problem: a length of
// `57.3 mm` must read `57,3 mm` in French, German, Spanish and Italian, and a decimal separator
// misread in a *medical measurement* is a real one.
//
// The UNITS are not translated. `HU` is an eponym (Hounsfield) and is `HU` in every language;
// `mm`, `mm²` and `°` are SI. Only the number in front of them is localised.

import { currentLanguage, type Language } from './i18n'

/**
 * The regional locale to hand to Intl for each UI language.
 *
 * A bare "en" means en-US to Intl, which renders 15 March 2021 as "Mar 15, 2021". This app's
 * English is British — it says *Colour*, not *Color* — and it has always shown "15 Mar 2021".
 * So "en" resolves to en-GB. The others are the unmarked variety of each language.
 */
const INTL_LOCALE: Record<Language, string> = {
  en: 'en-GB',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
  it: 'it-IT',
}

function intlLocale(): string {
  return INTL_LOCALE[currentLanguage()]
}

/** Intl objects are expensive to build and get made on every render otherwise. */
const numberCache = new Map<string, Intl.NumberFormat>()

function numberFormatter(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const locale = intlLocale()
  const key = `${locale}:${JSON.stringify(options)}`

  let formatter = numberCache.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options)
    numberCache.set(key, formatter)
  }
  return formatter
}

/**
 * A number with a fixed number of decimals, in the active locale.
 *
 * Replaces every `toFixed()` in the app: measurements, zoom, slice spacing.
 */
export function formatNumber(value: unknown, digits = 1): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'

  return numberFormatter({
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

/** An integer, grouped per the locale (1 234 in French, 1,234 in English). */
export function formatInteger(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return numberFormatter({ maximumFractionDigits: 0 }).format(value)
}

/** A percentage, already scaled 0–100. */
export function formatPercent(value: number): string {
  return numberFormatter({ maximumFractionDigits: 0 }).format(value)
}

/**
 * A byte count.
 *
 * `style: 'unit'` is what makes this correct rather than merely translated: French renders
 * megabytes as `Mo`, not `MB`. Hand-concatenating a localised number with an English unit would
 * produce `1,5 MB` — half-right, which reads worse than either.
 */
const BYTE_UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'

  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit++
  }

  return numberFormatter({
    style: 'unit',
    unit: BYTE_UNITS[unit],
    unitDisplay: 'short',
    maximumFractionDigits: unit === 0 ? 0 : value < 10 ? 1 : 0,
  }).format(value)
}

// ---- dates -------------------------------------------------------------------

const dateCache = new Map<string, Intl.DateTimeFormat>()

function dateFormatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const locale = intlLocale()
  const key = `${locale}:${JSON.stringify(options)}`

  let formatter = dateCache.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options)
    dateCache.set(key, formatter)
  }
  return formatter
}

/** A DICOM DA string ("20210315") to a Date, or null. */
export function parseDicomDate(da: string | null | undefined): Date | null {
  if (!da || da.length < 8 || !/^\d{8}/.test(da)) return null

  const year = Number(da.slice(0, 4))
  const month = Number(da.slice(4, 6))
  const day = Number(da.slice(6, 8))
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  return new Date(year, month - 1, day)
}

/** A DICOM DA rendered in the active locale. */
export function formatDicomDate(da: string | null | undefined): string {
  const date = parseDicomDate(da)
  if (!date) return '—'

  return dateFormatter({ day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

/** An ISO timestamp (from the API) rendered in the active locale. */
export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—'

  const date = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(date.getTime())) return '—'

  return dateFormatter({ day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

/** Caches are keyed by locale, so they must be dropped when the locale changes. */
export function resetFormatCaches(): void {
  numberCache.clear()
  dateCache.clear()
}
