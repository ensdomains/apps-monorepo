import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { fromPromise, ok } from 'neverthrow'
import {
  getSourceExpiry,
  normalizePreviewUrl,
  type PreviewMetadata,
} from './policy'

export class PreviewFetchError extends TaggedError('PREVIEW_FETCH_ERROR')<{
  cause: unknown
  kind: 'missing' | 'failure'
  cacheUntil?: number
}> {}

class PreviewLimitError extends Error {}

const awaitWithSignal = async <T>(promise: Promise<T>, signal: AbortSignal) => {
  signal.throwIfAborted()
  let onAbort = () => {}
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
  })
  try {
    return await Promise.race([promise, aborted])
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

const readBody = async ({
  response,
  maxBytes,
  signal,
}: {
  readonly response: Response
  readonly maxBytes: number
  readonly signal: AbortSignal
}) => {
  const reader = response.body?.getReader()
  if (!reader) return new ArrayBuffer(0)
  let chunks: readonly Uint8Array[] = []
  let length = 0
  try {
    if (Number(response.headers.get('Content-Length')) > maxBytes)
      throw new PreviewLimitError('Resource too large')
    while (true) {
      const chunk = await awaitWithSignal(reader.read(), signal)
      if (chunk.done) break
      length += chunk.value.byteLength
      if (length > maxBytes) throw new PreviewLimitError('Resource too large')
      chunks = [...chunks, chunk.value]
    }
    return await new Blob([...chunks]).arrayBuffer()
  } finally {
    // Cancellation must not hold a response open when an origin stalls.
    void reader.cancel().catch(() => undefined)
  }
}

export const readPreviewBody = (params: Parameters<typeof readBody>[0]) =>
  fromPromise(
    readBody(params),
    (cause) =>
      new PreviewFetchError({
        cause,
        kind: cause instanceof PreviewLimitError ? 'missing' : 'failure',
      }),
  )

export const fetchPreviewResource = ResultFn(async function* ({
  url,
  fetcher,
  signal,
  now,
  accept,
}: {
  readonly url: string
  readonly fetcher: typeof fetch
  readonly signal: AbortSignal
  readonly now: () => number
  readonly accept: string
}) {
  let target = yield* normalizePreviewUrl(url).mapErr(
    (cause) => new PreviewFetchError({ cause, kind: 'missing' }),
  )
  let expiresAt = Number.POSITIVE_INFINITY
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = yield* fromPromise(
      awaitWithSignal(
        fetcher(target, {
          redirect: 'manual',
          signal,
          headers: { Accept: accept, 'User-Agent': 'ENS-Link-Preview/1.0' },
          cache: 'no-store',
        }),
        signal,
      ),
      (cause) =>
        new PreviewFetchError({
          cause,
          kind: 'failure',
          cacheUntil: expiresAt,
        }),
    )
    expiresAt = Math.min(
      expiresAt,
      getSourceExpiry({
        cacheControl: response.headers.get('Cache-Control'),
        age: response.headers.get('Age'),
        now: now(),
      }),
    )
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      void response.body?.cancel().catch(() => undefined)
      const location = response.headers.get('Location')
      const next = location ? normalizePreviewUrl(location, target) : undefined
      if (!next || next.isErr() || redirects === 3)
        return yield* new PreviewFetchError({
          cause: 'Disallowed redirect',
          kind: 'missing',
          cacheUntil: expiresAt,
        })
      target = next.value
      continue
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined)
      return yield* new PreviewFetchError({
        cause: `Upstream status ${response.status}`,
        kind: [404, 410].includes(response.status) ? 'missing' : 'failure',
        cacheUntil: expiresAt,
      })
    }
    return ok({ response, url: target, expiresAt })
  }
  return yield* new PreviewFetchError({
    cause: 'Redirect limit',
    kind: 'missing',
  })
})

export const extractPreviewMetadata = (body: ArrayBuffer) =>
  fromPromise(
    (async () => {
      let metadata: PreviewMetadata = { bases: [], images: [] }
      const rewriter = new HTMLRewriter()
        .on('base[href]', {
          element(element) {
            const href = element.getAttribute('href')
            if (href && metadata.bases.length < 8)
              metadata = { ...metadata, bases: [...metadata.bases, href] }
          },
        })
        .on('meta', {
          element(element) {
            const property = (
              element.getAttribute('property') ?? element.getAttribute('name')
            )?.toLowerCase()
            const content = element.getAttribute('content')
            if (
              property &&
              content &&
              /^(?:og:image(?::(?:url|secure_url))?|twitter:image(?::src)?)$/.test(
                property,
              ) &&
              metadata.images.length < 64
            ) {
              metadata = {
                ...metadata,
                images: [...metadata.images, { property, content }],
              }
            }
          },
        })
      await rewriter
        .transform(
          new Response(body, { headers: { 'Content-Type': 'text/html' } }),
        )
        .arrayBuffer()
      return metadata
    })(),
    (cause) => new PreviewFetchError({ cause, kind: 'failure' }),
  )
