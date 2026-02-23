import resources from 'virtual:i18next-loader'
import i18n, { type Resource } from 'i18next'
import { initReactI18next } from 'react-i18next'
import {
  getPersistedLanguagePreference,
  setPersistedLanguagePreference,
} from './language-preference-store'

const i18nResources = resources as Resource
const supportedLngs = Object.keys(i18nResources)
const fallbackLng = supportedLngs.includes('en')
  ? 'en'
  : (supportedLngs[0] ?? 'en')

const normalizeLanguage = (language: string) => language.toLowerCase()

const resolveSupportedLanguage = (
  language: string | null | undefined,
): string | null => {
  if (!language) {
    return null
  }

  const normalizedLanguage = normalizeLanguage(language)

  const exactMatch = supportedLngs.find(
    (supportedLanguage) =>
      normalizeLanguage(supportedLanguage) === normalizedLanguage,
  )

  if (exactMatch) {
    return exactMatch
  }

  return (
    supportedLngs.find((supportedLanguage) =>
      normalizedLanguage.startsWith(`${normalizeLanguage(supportedLanguage)}-`),
    ) ?? null
  )
}

if (!i18n.isInitialized) {
  const persistedLanguage = resolveSupportedLanguage(
    getPersistedLanguagePreference(),
  )
  const initialLanguage = persistedLanguage ?? fallbackLng

  i18n.use(initReactI18next).init({
    resources: i18nResources,
    lng: initialLanguage,
    fallbackLng,
    supportedLngs: supportedLngs.length > 0 ? supportedLngs : [fallbackLng],
    ns: ['dashboard'],
    defaultNS: 'dashboard',
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
    initImmediate: false,
  })

  if (typeof window !== 'undefined') {
    const persistedLanguageFromInit = resolveSupportedLanguage(
      i18n.resolvedLanguage ?? i18n.language,
    )

    if (persistedLanguageFromInit) {
      setPersistedLanguagePreference(persistedLanguageFromInit)
    }

    i18n.on('languageChanged', (language) => {
      const supportedLanguage = resolveSupportedLanguage(language)

      if (!supportedLanguage) {
        return
      }

      setPersistedLanguagePreference(supportedLanguage)
    })
  }
}

export { i18n }
