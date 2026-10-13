export const URL_INPUT_PREFIX = 'https://'

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i
const DOMAIN_LIKE_URL = /^[\w.-]+\.[a-z]{2,}(?:[/#?].*)?$/i

export const getUrlInputFocusValue = (value: string): string =>
  value.trim() === '' ? URL_INPUT_PREFIX : value

// Pasting a full URL after the prefilled https:// would otherwise double the scheme
export const getUrlInputChangeValue = (value: string): string => {
  if (!value.startsWith(URL_INPUT_PREFIX)) return value

  const rest = value.slice(URL_INPUT_PREFIX.length)
  return URL_SCHEME.test(rest) ? rest : value
}

export const getUrlInputBlurValue = (value: string): string => {
  const trimmed = value.trim()
  if (trimmed === URL_INPUT_PREFIX) return ''

  return DOMAIN_LIKE_URL.test(trimmed)
    ? `${URL_INPUT_PREFIX}${trimmed}`
    : trimmed
}
