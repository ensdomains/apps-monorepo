import { i18n } from '@lingui/core'
import {
  getPersistedLanguagePreference,
  setPersistedLanguagePreference,
} from './language-preference-store'

export const supportedLocales = ['en', 'es', 'fr'] as const
export type SupportedLocale = (typeof supportedLocales)[number]
export const defaultLocale: SupportedLocale = 'en'

const normalizeLanguage = (language: string) => language.toLowerCase()

const resolveSupportedLocale = (
  language: string | null | undefined,
): SupportedLocale | null => {
  if (!language) return null

  const normalized = normalizeLanguage(language)
  const exactMatch = supportedLocales.find(
    (loc) => normalizeLanguage(loc) === normalized,
  )
  if (exactMatch) return exactMatch

  return (
    supportedLocales.find((loc) =>
      normalized.startsWith(`${normalizeLanguage(loc)}-`),
    ) ?? null
  )
}

const loadCatalog = async (locale: SupportedLocale) => {
  const catalog = (await import(`../../locales/${locale}/dashboard.json`)) as {
    default: Record<string, string>
  }
  i18n.loadAndActivate({ locale, messages: catalog.default })
}

const persistedLanguage = resolveSupportedLocale(
  getPersistedLanguagePreference(),
)
const initialLocale = persistedLanguage ?? defaultLocale

loadCatalog(initialLocale)

if (typeof window !== 'undefined') {
  if (persistedLanguage) {
    setPersistedLanguagePreference(persistedLanguage)
  }
}

export const changeLocale = async (locale: string) => {
  const supported = resolveSupportedLocale(locale)
  if (!supported) return

  await loadCatalog(supported)
  setPersistedLanguagePreference(supported)
}

export { i18n }
