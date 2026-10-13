export const URL_INPUT_PREFIX = 'https://'

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i
const DOMAIN_LIKE_URL =
  /^[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)*\.(?:\p{L}{2,}|xn--[a-z0-9-]+)(?::\d{1,5})?(?:[/#?].*)?$/iu

// The prefilled https:// on its own counts as empty for validation
export const getUrlInputCheckValue = (value: string): string =>
  value.trim() === URL_INPUT_PREFIX ? '' : value

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
