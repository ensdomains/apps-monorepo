export const URL_INPUT_PREFIX = 'https://'

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i
// A host:port like example.com:8443 is not a scheme
const URL_SCHEME_PREFIX = /^[a-z][a-z0-9+.-]*:(?!\d+(?:[/?#]|$))/i

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

/** Trim, treat a lone https:// as empty, and add https:// to schemeless input. */
export const normalizeUrlInput = (value: string): string => {
  const trimmed = getUrlInputCheckValue(value).trim()
  if (trimmed === '' || URL_SCHEME_PREFIX.test(trimmed)) return trimmed

  return `${URL_INPUT_PREFIX}${trimmed}`
}

export const getUrlInputBlurValue = (value: string): string =>
  normalizeUrlInput(value)
