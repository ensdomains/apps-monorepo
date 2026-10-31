import { ResultFn } from '@ens-apps/utils/neverthrow'
import { ok, type ResultAsync } from 'neverthrow'
import * as v from 'valibot'
import { logger } from '#utils/logger.js'
import {
  extractPreviewMetadata,
  fetchPreviewResource,
  PreviewFetchError,
  readPreviewBody,
} from './fetch'
import {
  getImageContentType,
  getPreviewCacheControl,
  getPreviewFailureEntry,
  getRemainingTtl,
  hasImageSignature,
  MAX_HTML_BYTES,
  MAX_IMAGE_BYTES,
  MISSING_TTL_SECONDS,
  normalizePreviewUrl,
  PREVIEW_EXPIRY_HEADER,
  PREVIEW_TIMEOUT_MS,
  type PreviewEntry,
  previewEntrySchema,
  selectPreviewImage,
} from './policy'

type ImageEntry = Extract<PreviewEntry, { kind: 'image' }>
type PreviewDependencies = {
  readonly fetcher: typeof fetch
  readonly kv: Pick<KVNamespace, 'get' | 'put'>
  readonly cache: Pick<Cache, 'match' | 'put'>
  readonly now: () => number
  readonly waitUntil: (promise: Promise<unknown>) => void
}

const withExpiry = <T>(
  result: ResultAsync<T, PreviewFetchError>,
  expiresAt: number,
) =>
  result.mapErr(
    (error) =>
      new PreviewFetchError({
        cause: error.cause,
        kind: error.kind,
        cacheUntil: Math.min(
          error.cacheUntil ?? Number.POSITIVE_INFINITY,
          expiresAt,
        ),
      }),
  )

const loadPreview = ResultFn(async function* ({
  url,
  cached,
  fetcher,
  now,
  signal,
}: {
  readonly url: string
  readonly cached: ImageEntry | undefined
  readonly fetcher: typeof fetch
  readonly now: () => number
  readonly signal: AbortSignal
}) {
  const metadata = yield* ResultFn(async function* () {
    if (cached) return ok(cached)
    const page = yield* fetchPreviewResource({
      url,
      fetcher,
      signal,
      now,
      accept: 'text/html,application/xhtml+xml',
    })
    const contentType = page.response.headers
      .get('Content-Type')
      ?.split(';')[0]
      ?.trim()
      .toLowerCase()
    if (!['text/html', 'application/xhtml+xml'].includes(contentType ?? '')) {
      void page.response.body?.cancel().catch(() => undefined)
      return ok({
        kind: 'missing',
        expiresAt: Math.min(page.expiresAt, now() + MISSING_TTL_SECONDS * 1000),
      } satisfies PreviewEntry)
    }
    const html = yield* withExpiry(
      readPreviewBody({
        response: page.response,
        maxBytes: MAX_HTML_BYTES,
        signal,
      }),
      page.expiresAt,
    )
    const extracted = yield* withExpiry(
      extractPreviewMetadata(html),
      page.expiresAt,
    )
    const imageUrl = selectPreviewImage({
      metadata: extracted,
      pageUrl: page.url,
    })
    return ok(
      imageUrl
        ? ({
            kind: 'image',
            imageUrl,
            expiresAt: page.expiresAt,
          } satisfies ImageEntry)
        : ({
            kind: 'missing',
            expiresAt: Math.min(
              page.expiresAt,
              now() + MISSING_TTL_SECONDS * 1000,
            ),
          } satisfies PreviewEntry),
    )
  })()
  if (metadata.kind === 'missing') return ok(metadata)

  const image = yield* withExpiry(
    fetchPreviewResource({
      url: metadata.imageUrl,
      fetcher,
      signal,
      now,
      accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif',
    }),
    metadata.expiresAt,
  )
  const expiresAt = Math.min(metadata.expiresAt, image.expiresAt)
  const contentType = getImageContentType(
    image.response.headers.get('Content-Type'),
  )
  if (!contentType) {
    void image.response.body?.cancel().catch(() => undefined)
    return ok({
      kind: 'missing',
      expiresAt: Math.min(expiresAt, now() + MISSING_TTL_SECONDS * 1000),
    } satisfies PreviewEntry)
  }
  const body = yield* withExpiry(
    readPreviewBody({
      response: image.response,
      maxBytes: MAX_IMAGE_BYTES,
      signal,
    }),
    expiresAt,
  )
  if (!hasImageSignature(body, contentType))
    return ok({
      kind: 'missing',
      expiresAt: Math.min(expiresAt, now() + MISSING_TTL_SECONDS * 1000),
    } satisfies PreviewEntry)
  return ok({ ...metadata, expiresAt, body, contentType })
})

const bestEffort = <T>(promise: Promise<T>, operation: string) =>
  promise.catch(() => {
    logger.warn('Link preview cache unavailable', { operation })
    return undefined
  })

const previewHeaders = (expiresAt: number, now: number) => ({
  'Cache-Control': getPreviewCacheControl(expiresAt, now),
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox",
  'Referrer-Policy': 'no-referrer',
})

const readCachedImage = async ({
  cache,
  key,
  now,
}: {
  readonly cache: PreviewDependencies['cache']
  readonly key: Request
  readonly now: () => number
}) => {
  const image = await bestEffort(cache.match(key), 'image-read')
  if (!image) return undefined
  const expiresAt = Number(image.headers.get(PREVIEW_EXPIRY_HEADER))
  if (getRemainingTtl(expiresAt, now()) > 0) {
    return new Response(image.body, {
      headers: {
        ...previewHeaders(expiresAt, now()),
        'Content-Type':
          image.headers.get('Content-Type') ?? 'application/octet-stream',
      },
    })
  }
  void image.body?.cancel().catch(() => undefined)
  return undefined
}

const unavailableResponse = (
  entry: Exclude<PreviewEntry, ImageEntry>,
  now: number,
) =>
  new Response(null, {
    status: entry.kind === 'missing' ? 404 : 502,
    headers: previewHeaders(entry.expiresAt, now),
  })

export const getLinkPreviewResponse = async ({
  url,
  origin,
  dependencies,
}: {
  readonly url: string
  readonly origin: string
  readonly dependencies: PreviewDependencies
}): Promise<Response> => {
  const { kv, cache, now, fetcher, waitUntil } = dependencies
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url)),
  )
  const hash = Array.from(digest, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  const key = `link-preview:v1:${hash}`
  const cacheKey = new Request(`${origin}/link-preview/cache/v1/${hash}`)
  const cachedImage = await readCachedImage({ cache, key: cacheKey, now })
  if (cachedImage) return cachedImage

  const raw = await bestEffort(kv.get(key, 'json'), 'metadata-read')
  const parsed = v.safeParse(previewEntrySchema, raw)
  const cached =
    parsed.success && parsed.output.expiresAt > now()
      ? parsed.output
      : undefined
  if (cached && cached.kind !== 'image')
    return unavailableResponse(cached, now())
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(new Error('Preview lookup timed out')),
    PREVIEW_TIMEOUT_MS,
  )
  const result = await loadPreview({
    url,
    cached:
      cached?.kind === 'image' && normalizePreviewUrl(cached.imageUrl).isOk()
        ? cached
        : undefined,
    fetcher,
    now,
    signal: controller.signal,
  })
  clearTimeout(timeout)

  const outcome = result.isOk()
    ? result.value
    : getPreviewFailureEntry({
        kind: result.error.kind,
        cacheUntil: result.error.cacheUntil,
        now: now(),
      })
  const entry: PreviewEntry =
    outcome.kind === 'image'
      ? {
          kind: 'image',
          imageUrl: outcome.imageUrl,
          expiresAt: outcome.expiresAt,
        }
      : outcome
  const ttl = getRemainingTtl(entry.expiresAt, now())
  if (ttl >= 60)
    waitUntil(
      bestEffort(
        kv.put(key, JSON.stringify(entry), { expirationTtl: ttl }),
        'metadata-write',
      ),
    )
  if (result.isErr())
    logger.warn('Link preview fetch unavailable', {
      key,
      reason: result.error.kind,
    })
  if (outcome.kind !== 'image') return unavailableResponse(outcome, now())

  const response = new Response(outcome.body, {
    headers: {
      ...previewHeaders(entry.expiresAt, now()),
      'Content-Type': outcome.contentType,
    },
  })
  if (ttl > 0) {
    const stored = new Response(response.clone().body, {
      headers: {
        'Content-Type': outcome.contentType,
        'Cache-Control': `public, max-age=${ttl}`,
        [PREVIEW_EXPIRY_HEADER]: String(entry.expiresAt),
      },
    })
    waitUntil(bestEffort(cache.put(cacheKey, stored), 'image-write'))
  }
  return response
}
