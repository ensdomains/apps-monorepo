import { Trans, useLingui } from '@lingui/react/macro'
import { LanguagesIcon } from 'lucide-react'
import { useMemo } from 'react'
import { loadCatalog } from '@/lib/lingui'
import { LOCALES, type SupportedLocale } from '@/lib/locales.config'

interface LanguageSectionProps {
  onAction: () => void
}

const getLanguageLabel = (language: string) => {
  const normalizedLanguage = language.toLowerCase()

  return LOCALES[normalizedLanguage as SupportedLocale] ?? language
}

const allowedLanguages = new Set(Object.keys(LOCALES))

const toComparableLanguage = (language: string | null | undefined) =>
  language?.toLowerCase() ?? ''

export const LanguageSection = ({ onAction }: LanguageSectionProps) => {
  const { t, i18n } = useLingui()

  const availableLanguages = useMemo(() => {
    return [...Object.keys(LOCALES)]
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

  const resolvedLanguage = toComparableLanguage(i18n.locale)

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
        <Trans>Language</Trans>
      </label>
      <div className="flex items-center gap-2 rounded border border-border px-3 py-2">
        <LanguagesIcon className="size-4 text-muted-foreground" />
        <select
          aria-label={t`Language`}
          className="w-full bg-transparent text-foreground text-sm outline-none"
          id="language-selector"
          onChange={async (event) => {
            await loadCatalog(event.target.value as SupportedLocale)
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
