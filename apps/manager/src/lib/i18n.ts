import { getLocale, setLocale } from '@/paraglide/runtime.js'
import {
  getPersistedLanguagePreference,
  setPersistedLanguagePreference,
} from './language-preference-store'

export const supportedLanguages = ['en', 'es', 'fr'] as const
export type SupportedLanguage = (typeof supportedLanguages)[number]

const isSupportedLanguage = (lang: string): lang is SupportedLanguage =>
  (supportedLanguages as readonly string[]).includes(lang.toLowerCase())

export const initI18n = () => {
  const persisted = getPersistedLanguagePreference()

  if (persisted && isSupportedLanguage(persisted)) {
    setLocale(persisted as SupportedLanguage)
  }

  if (typeof window !== 'undefined') {
    setPersistedLanguagePreference(getLocale())
  }
}

export const changeLanguage = (language: string) => {
  if (!isSupportedLanguage(language)) return

  setLocale(language as SupportedLanguage)
  setPersistedLanguagePreference(language)
}

export { getLocale, setLocale }
