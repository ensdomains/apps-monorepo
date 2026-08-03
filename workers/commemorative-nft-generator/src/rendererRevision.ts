import { UnsupportedRendererOutputError } from './errors.js'
import { sha256Hex } from './media.js'

const REVISION_PATTERN = /^sha256:([0-9a-f]{64})$/
const SCRIPT_SOURCE_PATTERN =
  /<script\b[^>]*\bsrc=(?:"([^"]+)"|'([^']+)')[^>]*><\/script>/gi

const responseError = (response: Response, resource: string): Error =>
  response.status === 429 || response.status >= 500
    ? new Error(`${resource} returned HTTP ${response.status}`)
    : new UnsupportedRendererOutputError(
        `${resource} returned HTTP ${response.status}`,
      )

type LoadedRendererResponse = {
  readonly body: () => Promise<Uint8Array>
  readonly ok: () => boolean
  readonly status: () => number
  readonly url: () => string
}

const expectedRevisionDigest = (rendererRevision: string): string => {
  const revisionMatch = REVISION_PATTERN.exec(rendererRevision)
  if (!revisionMatch) {
    throw new UnsupportedRendererOutputError(
      'Renderer revision must be a sha256-prefixed lowercase digest',
    )
  }
  return revisionMatch[1]
}

const assertRendererBundleRevision = (
  bundle: Uint8Array | ArrayBuffer,
  rendererRevision: string,
): void => {
  const expectedRevision = expectedRevisionDigest(rendererRevision)
  const actualRevision = sha256Hex(bundle)
  if (actualRevision !== expectedRevision) {
    throw new UnsupportedRendererOutputError(
      `Renderer revision mismatch: expected ${expectedRevision}, received ${actualRevision}`,
    )
  }
}

export const findRendererBundleUrl = (
  rendererOrigin: string,
  html: string,
): string => {
  for (const match of html.matchAll(SCRIPT_SOURCE_PATTERN)) {
    const source = match[1] ?? match[2]
    if (source?.endsWith('.js'))
      return new URL(source, rendererOrigin).toString()
  }

  throw new UnsupportedRendererOutputError(
    'Renderer HTML does not contain a JavaScript entry bundle',
  )
}

export const verifyRendererRevision = async (params: {
  readonly rendererOrigin: string
  readonly rendererRevision: string
  readonly fetcher?: typeof fetch
}): Promise<string> => {
  expectedRevisionDigest(params.rendererRevision)

  const fetcher = params.fetcher ?? fetch
  const htmlResponse = await fetcher(params.rendererOrigin, {
    cache: 'no-store',
  })
  if (!htmlResponse.ok) throw responseError(htmlResponse, 'Renderer HTML')

  const bundleUrl = findRendererBundleUrl(
    params.rendererOrigin,
    await htmlResponse.text(),
  )
  const bundleResponse = await fetcher(bundleUrl, { cache: 'no-store' })
  if (!bundleResponse.ok) {
    throw responseError(bundleResponse, 'Renderer bundle')
  }

  assertRendererBundleRevision(
    await bundleResponse.arrayBuffer(),
    params.rendererRevision,
  )

  return bundleUrl
}

/**
 * Verifies the entry bundle response observed by Chromium for the exact HTML
 * document being captured. This avoids labeling a render with a revision that
 * was checked in a separate request before a deployment changed the page.
 */
export const verifyLoadedRendererRevision = async (params: {
  readonly documentHtml: string
  readonly documentUrl: string
  readonly rendererRevision: string
  readonly scriptResponses: readonly LoadedRendererResponse[]
}): Promise<string> => {
  expectedRevisionDigest(params.rendererRevision)

  const bundleUrl = findRendererBundleUrl(
    params.documentUrl,
    params.documentHtml,
  )
  const bundleResponses = params.scriptResponses.filter(
    (response) => response.url() === bundleUrl,
  )
  if (bundleResponses.length === 0) {
    throw new UnsupportedRendererOutputError(
      `Renderer entry bundle was not observed in the captured page: ${bundleUrl}`,
    )
  }

  for (const response of bundleResponses) {
    if (!response.ok()) {
      throw new UnsupportedRendererOutputError(
        `Renderer bundle returned HTTP ${response.status()}`,
      )
    }
    assertRendererBundleRevision(await response.body(), params.rendererRevision)
  }

  return bundleUrl
}
