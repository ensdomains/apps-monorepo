import resources from 'virtual:i18next-loader'
import i18n, { type Resource } from 'i18next'
import { initReactI18next } from 'react-i18next'

const i18nResources = resources as Resource
const supportedLngs = Object.keys(i18nResources)
const fallbackLng = supportedLngs.includes('en')
  ? 'en'
  : (supportedLngs[0] ?? 'en')

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: i18nResources,
    lng: fallbackLng,
    fallbackLng,
    supportedLngs: supportedLngs.length > 0 ? supportedLngs : [fallbackLng],
    ns: ['dashboard', 'navigation'],
    defaultNS: 'dashboard',
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
    initImmediate: false,
  })
}

export { i18n }
