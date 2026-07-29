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
  const revisionMatch = REVISION_PATTERN.exec(params.rendererRevision)
  if (!revisionMatch) {
    throw new UnsupportedRendererOutputError(
      'Renderer revision must be a sha256-prefixed lowercase digest',
    )
  }

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

  const actualRevision = sha256Hex(await bundleResponse.arrayBuffer())
  if (actualRevision !== revisionMatch[1]) {
    throw new UnsupportedRendererOutputError(
      `Renderer revision mismatch: expected ${revisionMatch[1]}, received ${actualRevision}`,
    )
  }

  return bundleUrl
}
