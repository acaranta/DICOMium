// i18next bootstrap.
//
// All five catalogues are bundled rather than lazy-loaded. They are a few KB each, and
// lazy-loading buys a flash of untranslated text on every first paint for no real gain.
//
// Language resolution, in order:
//   1. the user's saved preference  (user_preferences.language — set by AppShell once /me lands)
//   2. localStorage                 (so a reload before /me answers does not flicker)
//   3. the browser                  (navigator.language)
//   4. English
//
// The user's preference is NOT known at module load — it arrives with /api/auth/me — so
// i18next starts from localStorage/browser and `applyUserLanguage()` corrects it afterwards.
// That ordering is why a signed-in user's choice must also be written to localStorage: without
// it, every reload would briefly render the browser's language before snapping to theirs.

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import en from '../locales/en'
import fr from '../locales/fr'
import de from '../locales/de'
import es from '../locales/es'
import it from '../locales/it'

export const LANGUAGES = ['en', 'fr', 'de', 'es', 'it'] as const
export type Language = (typeof LANGUAGES)[number]

/** Endonyms — a language picker that names languages in English is useless to the people who
 *  need it. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  it: 'Italiano',
}

const STORAGE_KEY = 'dicomium_language'

export const resources = { en, fr, de, es, it }

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: [...LANGUAGES],
    // "fr-CA" and "fr-FR" both resolve to "fr" — we ship one catalogue per language, not per
    // region.
    load: 'languageOnly',
    nonExplicitSupportedLngs: true,

    defaultNS: 'common',
    ns: ['common', 'auth', 'account', 'library', 'upload', 'viewer', 'errors'],

    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: STORAGE_KEY,
      caches: ['localStorage'],
    },

    interpolation: {
      // React already escapes everything it renders.
      escapeValue: false,
    },

    returnNull: false,
  })

/**
 * Keep the document itself in step.
 *
 * `<html lang>` matters for screen readers (it picks the voice) and for the browser's own
 * hyphenation. The description is what a link preview shows. Both live in index.html, which is
 * static and ships before any of this runs — hence the fix-up here rather than a template.
 * The <title> is deliberately left alone: "DICOMium" is a name, not a word.
 */
function syncDocument(lng: string) {
  document.documentElement.lang = lng

  const description = document.querySelector('meta[name="description"]')
  description?.setAttribute('content', i18n.t('app.description', { ns: 'common' }))
}

i18n.on('languageChanged', syncDocument)
syncDocument(i18n.resolvedLanguage ?? 'en')

/**
 * Apply the language stored against the user's account.
 *
 * `null` means "follow the browser": we do NOT force English, we simply leave the detector's
 * answer alone. Defaulting a null to 'en' here would silently override the browser preference
 * of every user who never opened the settings.
 */
export function applyUserLanguage(language: string | null | undefined): void {
  if (!language) return
  if (!LANGUAGES.includes(language as Language)) return
  if (i18n.resolvedLanguage === language) return

  void i18n.changeLanguage(language)
}

/** The language actually in force, after fallbacks. */
export function currentLanguage(): Language {
  const resolved = i18n.resolvedLanguage
  return LANGUAGES.includes(resolved as Language) ? (resolved as Language) : 'en'
}

export default i18n
