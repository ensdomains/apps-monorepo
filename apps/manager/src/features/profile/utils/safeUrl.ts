import * as v from 'valibot'

const SAFE_HTTP_URL_PROTOCOLS = ['http:', 'https:'] as const

export const isSafeHttpUrl = (value: string): boolean => {
  const trimmed = value.trim()
  if (!trimmed) return false

  try {
    const parsedUrl = new URL(trimmed)
    return SAFE_HTTP_URL_PROTOCOLS.includes(
      parsedUrl.protocol as (typeof SAFE_HTTP_URL_PROTOCOLS)[number],
    )
  } catch {
    return false
  }
}

export const safeHttpHref = (
  value: string | null | undefined,
): string | undefined => {
  const trimmed = value?.trim()
  if (!trimmed || !isSafeHttpUrl(trimmed)) return undefined
  return trimmed
}

export const createSafeUrlSchema = (message: string) =>
  v.pipe(v.string(), v.trim(), v.check(isSafeHttpUrl, message))
