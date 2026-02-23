import { LanguagesIcon } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

interface LanguageSectionProps {
  onAction: () => void
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  nl: 'Nederlands',
  pl: 'Polski',
  pt: 'Português',
  'pt-br': 'Português (Brasil)',
  ru: 'Русский',
  tr: 'Türkçe',
  uk: 'Українська',
  vi: 'Tiếng Việt',
  'zh-cn': '中文 (简体)',
  'zh-tw': '中文 (繁體)',
}

const getLanguageLabel = (language: string) => {
  const normalizedLanguage = language.toLowerCase()

  return LANGUAGE_LABELS[normalizedLanguage] ?? language
}

const toComparableLanguage = (language: string | null | undefined) =>
  language?.toLowerCase() ?? ''

export const LanguageSection = ({ onAction }: LanguageSectionProps) => {
  const { i18n } = useTranslation()

  const supportedLanguages = i18n.options.supportedLngs

  const availableLanguages = useMemo(() => {
    const languageList = Array.isArray(supportedLanguages)
      ? supportedLanguages
      : []

    return languageList
      .filter((language): language is string => Boolean(language))
      .filter((language) => language !== 'cimode')
      .sort((languageA, languageB) =>
        getLanguageLabel(languageA).localeCompare(getLanguageLabel(languageB)),
      )
  }, [supportedLanguages])

  if (availableLanguages.length === 0) {
    return null
  }

  const resolvedLanguage = toComparableLanguage(
    i18n.resolvedLanguage ?? i18n.language,
  )

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
        Language
      </label>
      <div className="flex items-center gap-2 rounded border border-border px-3 py-2">
        <LanguagesIcon className="size-4 text-muted-foreground" />
        <select
          aria-label="Language"
          className="w-full bg-transparent text-foreground text-sm outline-none"
          id="language-selector"
          onChange={async (event) => {
            await i18n.changeLanguage(event.target.value)
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
