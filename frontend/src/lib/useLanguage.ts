import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type Preferences } from './api'
import { useAuth } from './auth'
import { currentLanguage, LANGUAGES, type Language } from './i18n'

/**
 * Changing the language has to happen in two places, and the order matters.
 *
 * i18next is switched **first**, so the UI repaints immediately rather than waiting on a
 * round-trip. The preference is then persisted so it survives on another device — but only for
 * a signed-in user. A visitor on the login page has no account to save it to, and i18next's own
 * localStorage cache is enough for them.
 *
 * If the save fails, the UI is deliberately left in the new language: the user asked for it,
 * they can see it worked, and silently snapping back would be worse than a preference that did
 * not persist.
 */
export function useLanguage() {
  const { i18n } = useTranslation()
  const { user, refresh } = useAuth()

  const language = currentLanguage()

  const setLanguage = useCallback(
    async (next: Language | 'auto') => {
      if (next !== 'auto') {
        await i18n.changeLanguage(next)
      } else {
        // "auto" hands control back to the browser. Drop i18next's cached choice, or the
        // detector would just find it again on the next load and nothing would change.
        localStorage.removeItem('dicomium_language')
        await i18n.changeLanguage(navigator.language.split('-')[0])
      }

      if (!user) return

      try {
        await api.patch<Preferences>('/api/account/preferences', { language: next })
        await refresh()
      } catch {
        // See above: the UI stays in the language they picked.
      }
    },
    [i18n, user, refresh],
  )

  return {
    /** The language actually in force. */
    language,
    /** What the user explicitly chose, or 'auto' if they are following the browser. */
    preference: (user?.language ?? 'auto') as Language | 'auto',
    languages: LANGUAGES,
    setLanguage,
  }
}
