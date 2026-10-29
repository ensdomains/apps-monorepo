import { TaggedError } from '@ens-apps/utils/neverthrow'
import { err, fromThrowable, ok } from 'neverthrow'
import { match } from 'ts-pattern'
import * as v from 'valibot'

export const PREVIEW_TTL_SECONDS = 24 * 60 * 60
export const MISSING_TTL_SECONDS = 60 * 60
export const FAILURE_TTL_SECONDS = 5 * 60
export const MAX_HTML_BYTES = 512 * 1024
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const PREVIEW_TIMEOUT_MS = 10_000
export const PREVIEW_EXPIRY_HEADER = 'X-Link-Preview-Expires'

export class InvalidPreviewUrlError extends TaggedError('INVALID_PREVIEW_URL')<{
  cause: unknown
}> {}

const parseUrl = fromThrowable(
  (value: string, base?: string) => {
    const url = new URL(value, base)
    return { url, pathname: decodeURIComponent(url.pathname) }
  },
  (cause) => new InvalidPreviewUrlError({ cause }),
)
const LOCAL_HOST =
  /(?:^|\.)(?:localhost|local|internal|intranet|lan|home|home\.arpa|test|invalid|onion)$/i
const IPV4_HOST = /^\d+(?:\.\d+){3}$/

export const normalizePreviewUrl = (value: string, base?: string) =>
  parseUrl(value, base).andThen(({ url, pathname }) => {
    const hostname = url.hostname.replace(/\.$/, '')
    if (
      value.length > 4096 ||
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port ||
      !hostname.includes('.') ||
      hostname.includes(':') ||
      IPV4_HOST.test(hostname) ||
      LOCAL_HOST.test(hostname) ||
      /(?:^|\/)link-preview\/image\/?$/i.test(pathname)
    ) {
      return err(
        new InvalidPreviewUrlError({ cause: 'Disallowed preview URL' }),
      )
    }
    return ok(`${url.origin}${url.pathname}${url.search}`)
  })

export type PreviewMetadata = {
  readonly bases: readonly string[]
  readonly images: readonly {
    readonly property: string
    readonly content: string
  }[]
}

export const selectPreviewImage = ({
  metadata,
  pageUrl,
}: {
  readonly metadata: PreviewMetadata
  readonly pageUrl: string
}) => {
  const base =
    metadata.bases
      .map((value) => normalizePreviewUrl(value, pageUrl).unwrapOr(undefined))
      .find((value) => value !== undefined) ?? pageUrl
  const candidates = [
    'og:image:secure_url',
    'og:image',
    'og:image:url',
    'twitter:image',
    'twitter:image:src',
  ].flatMap((property) =>
    metadata.images.filter((image) => image.property === property),
  )
  return candidates
    .map(({ content }) =>
      content.trim()
        ? normalizePreviewUrl(content.trim(), base).unwrapOr(undefined)
        : undefined,
    )
    .find((value) => value !== undefined)
}

export const getSourceExpiry = ({
  cacheControl,
  age,
  expires,
  date,
  now,
}: {
  readonly cacheControl: string | null
  readonly age: string | null
  readonly expires: string | null
  readonly date: string | null
  readonly now: number
}) => {
  if (
    /(?:^|,)\s*(?:private|no-store|no-cache)(?:\s|=|,|$)/i.test(
      cacheControl ?? '',
    )
  )
    return now
  const maxAge =
    /(?:^|,)\s*s-maxage\s*=\s*"?(\d+)/i.exec(cacheControl ?? '') ??
    /(?:^|,)\s*max-age\s*=\s*"?(\d+)/i.exec(cacheControl ?? '')
  const parsedDate = Date.parse(date ?? '')
  const sourceDate = Number.isFinite(parsedDate) ? parsedDate : now
  const expiresAt = Date.parse(expires ?? '')
  const expiryTtl = Number.isFinite(expiresAt)
    ? (expiresAt - sourceDate) / 1000
    : 0
  const fallbackTtl = expires === null ? PREVIEW_TTL_SECONDS : expiryTtl
  const ttl = maxAge?.[1] === undefined ? fallbackTtl : Number(maxAge[1])
  const sourceAge = Math.max(0, Number(age) || 0, (now - sourceDate) / 1000)
  return (
    now + Math.max(0, Math.min(PREVIEW_TTL_SECONDS, ttl - sourceAge)) * 1000
  )
}

export const getRemainingTtl = (expiresAt: number, now: number) =>
  Math.max(0, Math.floor((expiresAt - now) / 1000))

export const getPreviewCacheControl = (expiresAt: number, now: number) => {
  const remaining = getRemainingTtl(expiresAt, now)
  return remaining > 0
    ? `public, max-age=${Math.min(MISSING_TTL_SECONDS, remaining)}, s-maxage=${remaining}, must-revalidate`
    : 'no-store'
}

const expirySchema = v.pipe(v.number(), v.finite())
export const previewEntrySchema = v.variant('kind', [
  v.object({
    kind: v.literal('image'),
    imageUrl: v.string(),
    expiresAt: expirySchema,
  }),
  v.object({ kind: v.literal('missing'), expiresAt: expirySchema }),
  v.object({ kind: v.literal('failure'), expiresAt: expirySchema }),
])
export type PreviewEntry = v.InferOutput<typeof previewEntrySchema>

export const getPreviewFailureEntry = ({
  kind,
  cacheUntil,
  now,
}: {
  readonly kind: 'missing' | 'failure'
  readonly cacheUntil: number | undefined
  readonly now: number
}) => ({
  kind,
  expiresAt: Math.min(
    cacheUntil ?? Number.POSITIVE_INFINITY,
    now +
      (kind === 'missing' ? MISSING_TTL_SECONDS : FAILURE_TTL_SECONDS) * 1000,
  ),
})

export const getImageContentType = (value: string | null) => {
  const type = value?.split(';')[0]?.trim().toLowerCase()
  return type &&
    [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/avif',
    ].includes(type)
    ? type
    : undefined
}

export const hasImageSignature = (body: ArrayBuffer, contentType: string) => {
  const bytes = new Uint8Array(body)
  const startsWith = (signature: readonly number[]) =>
    signature.every((byte, index) => bytes[index] === byte)
  const text = (start: number, end: number) =>
    String.fromCharCode(...bytes.subarray(start, end))
  return match(contentType)
    .with('image/png', () => startsWith([137, 80, 78, 71, 13, 10, 26, 10]))
    .with('image/jpeg', () => startsWith([255, 216, 255]))
    .with('image/gif', () => ['GIF87a', 'GIF89a'].includes(text(0, 6)))
    .with('image/webp', () => text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP')
    .with(
      'image/avif',
      () => text(4, 8) === 'ftyp' && /avif|avis/.test(text(8, 32)),
    )
    .otherwise(() => false)
}
