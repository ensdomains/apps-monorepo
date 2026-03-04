import { i18n } from '@lingui/core'
import type { SupportedLocale } from '@/lib/locales.config'

console.log('locales', i18n.locales)

export async function loadCatalog(locale: SupportedLocale) {
  const { messages } = await import(`@/locales/${locale}/messages.po`)
  i18n.loadAndActivate({ locale, messages })

  console.log('locales2', i18n.locales)
}
