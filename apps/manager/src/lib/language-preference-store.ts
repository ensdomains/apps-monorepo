import { createStore } from '@xstate/store-react'
import { persist } from '@/utils/xstate-store'

export const LANGUAGE_PREFERENCE_STORAGE_KEY = 'ens-manager-language'

type LanguagePreferenceContext = {
  language: string | null
}

type LanguagePreferenceEvents = {
  setLanguage: { language: string }
}

const languagePreferenceSerde = {
  serialize: JSON.stringify,
  deserialize: (value: string) => {
    try {
      const parsed = JSON.parse(value) as unknown

      if (typeof parsed === 'string') {
        return {
          context: {
            language: parsed,
          },
        }
      }

      return parsed
    } catch {
      const legacyLanguage = value.trim()

      return {
        context: {
          language: legacyLanguage.length > 0 ? legacyLanguage : null,
        },
      }
    }
  },
}

export const languagePreferenceStore = createStore<
  LanguagePreferenceContext,
  LanguagePreferenceEvents,
  never
>({
  context: {
    language: null,
  },
  on: {
    setLanguage: (context, event) => ({
      ...context,
      language: event.language,
    }),
  },
}).with(
  persist({
    name: LANGUAGE_PREFERENCE_STORAGE_KEY,
    serde: languagePreferenceSerde,
  }),
)

export const getPersistedLanguagePreference = () =>
  languagePreferenceStore.get().context.language

export const setPersistedLanguagePreference = (language: string) => {
  languagePreferenceStore.trigger.setLanguage({ language })
}
