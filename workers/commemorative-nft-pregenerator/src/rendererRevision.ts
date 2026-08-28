import { sha256Hex } from './media.js'

const RENDERER_REVISION_PATTERN = /^sha256:([0-9a-f]{64})$/
const SCRIPT_SOURCE_PATTERN =
  /<script\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi
const LINK_TAG_PATTERN = /<link\b[^>]*>/gi
const MEDIA_TAG_PATTERN = /<(?:img|source)\b[^>]*>/gi
const NEW_URL_PATTERN =
  /\bnew\s+URL\(\s*(?:"([^"]+)"|'([^']+)')\s*,\s*import\.meta\.url\s*\)/gi
const DYNAMIC_IMPORT_PATTERN = /\bimport\(\s*(?:"([^"]+)"|'([^']+)')\s*\)/gi
const CSS_URL_PATTERN = /\burl\(\s*(?:"([^"]+)"|'([^']+)'|([^\s)]+))\s*\)/gi
const PINNED_LINK_RELATIONS = new Set([
  'icon',
  'modulepreload',
  'preload',
  'stylesheet',
])
const MAX_RENDERER_ASSET_COUNT = 256
const MAX_RENDERER_ASSET_BYTES = 64 * 1024 * 1024

export class RendererRevisionError extends Error {
  override readonly name = 'RendererRevisionError'
  readonly isTransient: boolean

  constructor(message: string, options?: { readonly isTransient?: boolean }) {
    super(message)
    this.isTransient = options?.isTransient ?? false
  }
}

export type VerifiedRendererAsset = {
  readonly body: Uint8Array
  readonly contentType: string
  readonly sha256: string
  readonly url: string
}

export type VerifiedRendererBundle = {
  readonly assetSetDigest: string
  readonly assets: readonly VerifiedRendererAsset[]
  readonly body: Uint8Array
  readonly contentType: string
  readonly documentContentType: string
  readonly documentHtml: string
  readonly documentUrl: string
  readonly url: string
}

export const rendererRevisionDigest = (rendererRevision: string): string => {
  const match = RENDERER_REVISION_PATTERN.exec(rendererRevision)
  if (!match) {
    throw new RendererRevisionError(
      'Renderer revision must be a sha256-prefixed lowercase digest',
    )
  }
  return match[1]
}

const attributeValue = (tag: string, attribute: string): string | undefined => {
  const pattern = new RegExp(
    `\\b${attribute}\\s*=\\s*(?:"([^"]+)"|'([^']+)'|([^\\s>]+))`,
    'i',
  )
  const match = pattern.exec(tag)
  return match?.[1] ?? match?.[2] ?? match?.[3]
}

const addAssetReference = (
  references: Set<string>,
  baseUrl: string,
  documentOrigin: string,
  rawReference: string | undefined,
): void => {
  const reference = rawReference?.replaceAll('&amp;', '&').trim()
  if (!reference || reference.startsWith('#')) return

  let url: URL
  try {
    url = new URL(reference, baseUrl)
  } catch {
    throw new RendererRevisionError(
      `Renderer contains an invalid asset URL: ${reference}`,
    )
  }

  if (url.protocol === 'data:' || url.protocol === 'blob:') return
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new RendererRevisionError(
      `Renderer asset must use HTTP or HTTPS: ${url.toString()}`,
    )
  }
  if (url.origin !== documentOrigin) {
    throw new RendererRevisionError(
      `Renderer asset crosses the document origin: ${url.toString()}`,
    )
  }
  url.hash = ''
  references.add(url.toString())
}

const addPatternReferences = (
  references: Set<string>,
  baseUrl: string,
  documentOrigin: string,
  content: string,
  pattern: RegExp,
): void => {
  for (const match of content.matchAll(pattern)) {
    addAssetReference(
      references,
      baseUrl,
      documentOrigin,
      match[1] ?? match[2] ?? match[3],
    )
  }
}

const findHtmlAssetUrls = (
  baseUrl: string,
  documentOrigin: string,
  html: string,
): Set<string> => {
  const references = new Set<string>()
  addPatternReferences(
    references,
    baseUrl,
    documentOrigin,
    html,
    SCRIPT_SOURCE_PATTERN,
  )

  for (const match of html.matchAll(LINK_TAG_PATTERN)) {
    const tag = match[0]
    const relations = (attributeValue(tag, 'rel') ?? '')
      .toLocaleLowerCase('en-US')
      .split(/\s+/)
    if (!relations.some((relation) => PINNED_LINK_RELATIONS.has(relation))) {
      continue
    }
    addAssetReference(
      references,
      baseUrl,
      documentOrigin,
      attributeValue(tag, 'href'),
    )
  }

  for (const match of html.matchAll(MEDIA_TAG_PATTERN)) {
    addAssetReference(
      references,
      baseUrl,
      documentOrigin,
      attributeValue(match[0], 'src'),
    )
  }
  return references
}

const findScriptAssetUrls = (
  baseUrl: string,
  documentOrigin: string,
  script: string,
): Set<string> => {
  const references = new Set<string>()
  addPatternReferences(
    references,
    baseUrl,
    documentOrigin,
    script,
    NEW_URL_PATTERN,
  )
  addPatternReferences(
    references,
    baseUrl,
    documentOrigin,
    script,
    DYNAMIC_IMPORT_PATTERN,
  )
  return references
}

const findStylesheetAssetUrls = (
  baseUrl: string,
  documentOrigin: string,
  stylesheet: string,
): Set<string> => {
  const references = new Set<string>()
  addPatternReferences(
    references,
    baseUrl,
    documentOrigin,
    stylesheet,
    CSS_URL_PATTERN,
  )
  return references
}

const defaultContentType = (url: string): string => {
  const pathname = new URL(url).pathname.toLocaleLowerCase('en-US')
  if (pathname.endsWith('.html') || pathname.endsWith('/')) {
    return 'text/html; charset=utf-8'
  }
  if (pathname.endsWith('.css')) return 'text/css; charset=utf-8'
  if (pathname.endsWith('.js') || pathname.endsWith('.mjs')) {
    return 'application/javascript; charset=utf-8'
  }
  if (pathname.endsWith('.svg')) return 'image/svg+xml'
  if (pathname.endsWith('.png')) return 'image/png'
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) {
    return 'image/jpeg'
  }
  if (pathname.endsWith('.webp')) return 'image/webp'
  if (pathname.endsWith('.woff')) return 'font/woff'
  if (pathname.endsWith('.woff2')) return 'font/woff2'
  if (pathname.endsWith('.ttf')) return 'font/ttf'
  if (pathname.endsWith('.otf')) return 'font/otf'
  return 'application/octet-stream'
}

const isHtmlAsset = (asset: VerifiedRendererAsset): boolean =>
  asset.contentType.toLocaleLowerCase('en-US').includes('text/html')

const isScriptAsset = (asset: VerifiedRendererAsset): boolean => {
  const contentType = asset.contentType.toLocaleLowerCase('en-US')
  const pathname = new URL(asset.url).pathname.toLocaleLowerCase('en-US')
  return (
    contentType.includes('javascript') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.mjs')
  )
}

const isStylesheetAsset = (asset: VerifiedRendererAsset): boolean =>
  asset.contentType.toLocaleLowerCase('en-US').includes('text/css') ||
  new URL(asset.url).pathname.toLocaleLowerCase('en-US').endsWith('.css')

const findReferencedAssetUrls = (
  asset: VerifiedRendererAsset,
  documentOrigin: string,
): Set<string> => {
  if (
    !isHtmlAsset(asset) &&
    !isScriptAsset(asset) &&
    !isStylesheetAsset(asset)
  ) {
    return new Set()
  }

  const content = new TextDecoder().decode(asset.body)
  if (isHtmlAsset(asset)) {
    return findHtmlAssetUrls(asset.url, documentOrigin, content)
  }
  if (isScriptAsset(asset)) {
    return findScriptAssetUrls(asset.url, documentOrigin, content)
  }
  return findStylesheetAssetUrls(asset.url, documentOrigin, content)
}

export const findRendererBundleUrl = (
  documentUrl: string,
  html: string,
): string => {
  for (const match of html.matchAll(SCRIPT_SOURCE_PATTERN)) {
    const source = match[1] ?? match[2] ?? match[3]
    if (!source) continue

    const scriptUrl = new URL(source, documentUrl)
    if (scriptUrl.origin !== new URL(documentUrl).origin) {
      throw new RendererRevisionError(
        `Renderer entry bundle crosses the document origin: ${scriptUrl.toString()}`,
      )
    }
    scriptUrl.hash = ''
    if (
      scriptUrl.pathname.endsWith('.js') ||
      scriptUrl.pathname.endsWith('.mjs')
    ) {
      return scriptUrl.toString()
    }
  }

  throw new RendererRevisionError(
    'Renderer HTML does not contain a JavaScript entry bundle',
  )
}

const requireFetchResponse = (response: Response, resource: string): void => {
  if (response.ok) return

  const isTransient =
    response.status === 408 ||
    response.status === 425 ||
    response.status === 429 ||
    response.status >= 500
  throw new RendererRevisionError(
    `${resource} returned HTTP ${response.status}`,
    { isTransient },
  )
}

const fetchRendererAsset = async (params: {
  readonly documentOrigin: string
  readonly fetcher: typeof fetch
  readonly url: string
}): Promise<VerifiedRendererAsset> => {
  const requestedUrl = new URL(params.url)
  if (requestedUrl.origin !== params.documentOrigin) {
    throw new RendererRevisionError(
      `Renderer asset crosses the document origin: ${requestedUrl.toString()}`,
    )
  }
  const response = await params.fetcher(params.url, { cache: 'no-store' })
  requireFetchResponse(response, `Renderer asset ${params.url}`)

  const url = new URL(response.url || params.url)
  url.hash = ''
  if (url.origin !== params.documentOrigin) {
    throw new RendererRevisionError(
      `Renderer asset redirected across the document origin: ${url.toString()}`,
    )
  }
  const body = new Uint8Array(await response.arrayBuffer())
  return {
    body,
    contentType:
      response.headers.get('content-type') ??
      defaultContentType(url.toString()),
    sha256: sha256Hex(body),
    url: url.toString(),
  }
}

const rendererAssetIdentity = (
  assetUrl: string,
  documentUrl: string,
): string => {
  const document = new URL(documentUrl)
  const asset = new URL(assetUrl)
  if (asset.origin !== document.origin) {
    throw new RendererRevisionError(
      `Renderer asset crosses the document origin: ${asset.toString()}`,
    )
  }
  return `${asset.pathname}${asset.search}`
}

export const rendererAssetSetDigest = (
  assets: readonly VerifiedRendererAsset[],
  documentUrl: string,
): string => {
  const manifest = [...assets]
    .map((asset) => ({
      asset,
      identity: rendererAssetIdentity(asset.url, documentUrl),
    }))
    .sort((left, right) => left.identity.localeCompare(right.identity, 'en-US'))
    .map(({ asset, identity }) => `${identity}\u0000${asset.sha256}`)
    .join('\n')
  return sha256Hex(new TextEncoder().encode(manifest))
}

const assertRendererAssetSetRevision = (
  assets: readonly VerifiedRendererAsset[],
  documentUrl: string,
  rendererRevision: string,
): string => {
  const expectedDigest = rendererRevisionDigest(rendererRevision)
  const actualDigest = rendererAssetSetDigest(assets, documentUrl)
  if (actualDigest !== expectedDigest) {
    throw new RendererRevisionError(
      `Renderer asset-set revision mismatch: expected ${expectedDigest}, received ${actualDigest}`,
    )
  }
  return actualDigest
}

const assertRendererAssetGraphLimits = (
  assetCount: number,
  totalBytes: number,
): void => {
  if (assetCount > MAX_RENDERER_ASSET_COUNT) {
    throw new RendererRevisionError(
      `Renderer asset graph exceeds ${MAX_RENDERER_ASSET_COUNT} files`,
    )
  }
  if (totalBytes > MAX_RENDERER_ASSET_BYTES) {
    throw new RendererRevisionError(
      `Renderer asset graph exceeds ${MAX_RENDERER_ASSET_BYTES} bytes`,
    )
  }
}

const loadRendererAssets = async (params: {
  readonly documentUrl: string
  readonly fetcher: typeof fetch
}): Promise<readonly VerifiedRendererAsset[]> => {
  const documentUrl = new URL(params.documentUrl)
  if (documentUrl.protocol !== 'http:' && documentUrl.protocol !== 'https:') {
    throw new RendererRevisionError('Renderer document must use HTTP or HTTPS')
  }
  documentUrl.hash = ''
  const documentOrigin = documentUrl.origin
  const queuedUrls = [documentUrl.toString()]
  const seenUrls = new Set<string>()
  const assetsByUrl = new Map<string, VerifiedRendererAsset>()
  let totalBytes = 0

  while (queuedUrls.length > 0) {
    const requestedUrl = queuedUrls.shift()
    if (!requestedUrl || seenUrls.has(requestedUrl)) continue
    seenUrls.add(requestedUrl)

    const asset = await fetchRendererAsset({
      documentOrigin,
      fetcher: params.fetcher,
      url: requestedUrl,
    })
    if (assetsByUrl.has(asset.url)) continue

    assetsByUrl.set(asset.url, asset)
    seenUrls.add(asset.url)
    totalBytes += asset.body.byteLength
    assertRendererAssetGraphLimits(assetsByUrl.size, totalBytes)

    for (const url of findReferencedAssetUrls(asset, documentOrigin)) {
      if (!seenUrls.has(url)) queuedUrls.push(url)
    }
  }

  return [...assetsByUrl.values()].sort((left, right) =>
    left.url.localeCompare(right.url, 'en-US'),
  )
}

export const loadVerifiedRendererBundle = async (params: {
  readonly rendererOrigin: string
  readonly rendererRevision: string
  readonly fetcher?: typeof fetch
}): Promise<VerifiedRendererBundle> => {
  rendererRevisionDigest(params.rendererRevision)

  const assets = await loadRendererAssets({
    documentUrl: params.rendererOrigin,
    fetcher: params.fetcher ?? fetch,
  })
  const documentAsset = assets.find((asset) => isHtmlAsset(asset))
  if (!documentAsset) {
    throw new RendererRevisionError(
      'Renderer asset graph does not contain its HTML document',
    )
  }

  const documentHtml = new TextDecoder().decode(documentAsset.body)
  const bundleUrl = findRendererBundleUrl(documentAsset.url, documentHtml)
  const bundleAsset = assets.find((asset) => asset.url === bundleUrl)
  if (!bundleAsset) {
    throw new RendererRevisionError(
      `Renderer entry bundle was not pinned: ${bundleUrl}`,
    )
  }
  const assetSetDigest = assertRendererAssetSetRevision(
    assets,
    documentAsset.url,
    params.rendererRevision,
  )

  return {
    assetSetDigest,
    assets,
    body: bundleAsset.body,
    contentType: bundleAsset.contentType,
    documentContentType: documentAsset.contentType,
    documentHtml,
    documentUrl: documentAsset.url,
    url: bundleAsset.url,
  }
}
