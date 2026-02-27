import { useLingui } from '@lingui/react'

export const useTranslation = () => {
  const { i18n } = useLingui()

  const t = (id: string, values?: Record<string, unknown>): string =>
    i18n._(id, values)

  return { t, i18n }
}
