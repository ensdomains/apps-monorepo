import { LanguagesIcon } from 'lucide-react'
import { useMemo } from 'react'
import { changeLanguage, supportedLanguages } from '@/lib/i18n'
import * as m from '@/paraglide/messages.js'
import { getLocale } from '@/paraglide/runtime.js'

interface LanguageSectionProps {
  onAction: () => void
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
}

const getLanguageLabel = (language: string) => {
  const normalizedLanguage = language.toLowerCase()

  return LANGUAGE_LABELS[normalizedLanguage] ?? language
}

const allowedLanguages = new Set(Object.keys(LANGUAGE_LABELS))

const toComparableLanguage = (language: string | null | undefined) =>
  language?.toLowerCase() ?? ''

export const LanguageSection = ({ onAction }: LanguageSectionProps) => {
  const availableLanguages = useMemo(() => {
    return [...supportedLanguages]
      .filter((language) =>
        allowedLanguages.has(toComparableLanguage(language)),
      )
      .sort((languageA, languageB) =>
        getLanguageLabel(languageA).localeCompare(getLanguageLabel(languageB)),
      )
  }, [])

  if (availableLanguages.length === 0) {
    return null
  }

  const resolvedLanguage = toComparableLanguage(getLocale())

  const selectedLanguage =
    availableLanguages.find(
      (language) => toComparableLanguage(language) === resolvedLanguage,
    ) ??
    availableLanguages.find((language) =>
      resolvedLanguage.startsWith(`${toComparableLanguage(language)}-`),
    ) ??
    availableLanguages[0]

  return (
    <div className="space-y-1">
      <label
        className="block px-3 py-1 font-medium text-foreground text-sm"
        htmlFor="language-selector"
      >
        {m.common_language()}
      </label>
      <div className="flex items-center gap-2 rounded border border-border px-3 py-2">
        <LanguagesIcon className="size-4 text-muted-foreground" />
        <select
          aria-label={m.common_language()}
          className="w-full bg-transparent text-foreground text-sm outline-none"
          id="language-selector"
          onChange={(event) => {
            changeLanguage(event.target.value)
            onAction()
          }}
          value={selectedLanguage}
        >
          {availableLanguages.map((language) => (
            <option key={language} value={language}>
              {getLanguageLabel(language)}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
