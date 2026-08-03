import {
  getRenderInputKey,
  getTokenAssetKey,
  getTokenCompletionKey,
  TOKEN_ASSET_EXTENSIONS,
  type TokenAsset,
} from './assets'

const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'

const CONTENT_TYPES = {
  json: 'application/json',
  mp4: 'video/mp4',
  png: 'image/png',
} as const

const VERIFIED_CONTENT_TYPES = {
  ...CONTENT_TYPES,
  json: 'application/json; charset=utf-8',
} as const

const COMPLETION_SCHEMA_VERSION = 1
const COMPLETION_RUNTIME_ADAPTER = 'ec2-nvidia'
const SHA256_PATTERN = /^[0-9a-f]{64}$/

type CompletionArtifact = {
  readonly contentType: string
  readonly key: string
  readonly sha256: string
  readonly size: number
}

type CompletionMarker = {
  readonly artifacts: readonly CompletionArtifact[]
  readonly rendererRevision: string
  readonly runtimeAdapter: typeof COMPLETION_RUNTIME_ADAPTER
  readonly schemaVersion: typeof COMPLETION_SCHEMA_VERSION
  readonly tokenId: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasValidCompletionArtifacts = (
  value: unknown,
  tokenId: string,
): value is readonly CompletionArtifact[] => {
  if (!Array.isArray(value) || value.length !== TOKEN_ASSET_EXTENSIONS.length) {
    return false
  }

  const expectedArtifacts = new Map(
    TOKEN_ASSET_EXTENSIONS.map((extension) => [
      getTokenAssetKey(tokenId, extension),
      VERIFIED_CONTENT_TYPES[extension],
    ]),
  )
  const foundKeys = new Set<string>()

  for (const artifact of value) {
    if (
      !isRecord(artifact) ||
      typeof artifact.key !== 'string' ||
      typeof artifact.contentType !== 'string' ||
      typeof artifact.sha256 !== 'string' ||
      !SHA256_PATTERN.test(artifact.sha256) ||
      typeof artifact.size !== 'number' ||
      !Number.isSafeInteger(artifact.size) ||
      artifact.size <= 0 ||
      foundKeys.has(artifact.key) ||
      expectedArtifacts.get(artifact.key) !== artifact.contentType
    ) {
      return false
    }
    foundKeys.add(artifact.key)
  }

  return foundKeys.size === expectedArtifacts.size
}

const isValidCompletionMarker = (params: {
  readonly rendererRevision: string
  readonly tokenId: string
  readonly value: unknown
}): params is typeof params & { readonly value: CompletionMarker } =>
  isRecord(params.value) &&
  params.value.schemaVersion === COMPLETION_SCHEMA_VERSION &&
  params.value.tokenId === params.tokenId &&
  params.value.rendererRevision === params.rendererRevision &&
  params.value.runtimeAdapter === COMPLETION_RUNTIME_ADAPTER &&
  hasValidCompletionArtifacts(params.value.artifacts, params.tokenId)

const matchesCompletionArtifact = (
  object: R2Object | null,
  artifact: CompletionArtifact,
  rendererRevision: string,
): boolean =>
  object !== null &&
  object.size === artifact.size &&
  object.httpMetadata?.contentType === artifact.contentType &&
  object.customMetadata?.sha256 === artifact.sha256 &&
  object.customMetadata?.['renderer-revision'] === rendererRevision &&
  object.customMetadata?.['runtime-adapter'] === COMPLETION_RUNTIME_ADAPTER

interface ByteRange {
  readonly end: number
  readonly length: number
  readonly offset: number
}

type ByteRangeResult =
  | { readonly status: 'invalid' }
  | { readonly range: ByteRange; readonly status: 'valid' }

export const parseSingleByteRange = (
  header: string,
  size: number,
): ByteRangeResult => {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim())
  if (!match || size === 0) return { status: 'invalid' }

  const [, startValue, endValue] = match
  if (!startValue && !endValue) return { status: 'invalid' }

  const sizeBigInt = BigInt(size)

  if (!startValue) {
    const suffixLength = BigInt(endValue)
    if (suffixLength === 0n) return { status: 'invalid' }

    const length = suffixLength > sizeBigInt ? sizeBigInt : suffixLength
    const offset = sizeBigInt - length

    return {
      range: {
        end: size - 1,
        length: Number(length),
        offset: Number(offset),
      },
      status: 'valid',
    }
  }

  const start = BigInt(startValue)
  if (start >= sizeBigInt) return { status: 'invalid' }

  const requestedEnd = endValue ? BigInt(endValue) : sizeBigInt - 1n
  if (requestedEnd < start) return { status: 'invalid' }

  const end = requestedEnd >= sizeBigInt ? sizeBigInt - 1n : requestedEnd
  const length = end - start + 1n

  return {
    range: {
      end: Number(end),
      length: Number(length),
      offset: Number(start),
    },
    status: 'valid',
  }
}

const normalizeEtag = (etag: string): string => etag.trim().replace(/^W\//, '')

export const matchesIfNoneMatch = (
  ifNoneMatch: string,
  objectEtag: string,
): boolean => {
  if (ifNoneMatch.trim() === '*') return true

  const normalizedObjectEtag = normalizeEtag(objectEtag)
  return ifNoneMatch
    .split(',')
    .some((etag) => normalizeEtag(etag) === normalizedObjectEtag)
}

const getAssetHeaders = (object: R2Object, asset: TokenAsset): Headers => {
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('Cache-Control', IMMUTABLE_CACHE_CONTROL)
  headers.set('Content-Type', CONTENT_TYPES[asset.extension])
  headers.set('ETag', object.httpEtag)
  if (asset.extension === 'mp4') headers.set('Accept-Ranges', 'bytes')

  return headers
}

const getMetadataFirst = async (
  bucket: R2Bucket,
  asset: TokenAsset,
  request: Request,
): Promise<Response | null> => {
  const object = await bucket.head(asset.key)
  if (!object) return null

  const headers = getAssetHeaders(object, asset)
  const ifNoneMatch = request.headers.get('If-None-Match')

  if (ifNoneMatch && matchesIfNoneMatch(ifNoneMatch, object.httpEtag)) {
    return new Response(null, { headers, status: 304 })
  }

  const rangeHeader =
    asset.extension === 'mp4' ? request.headers.get('Range') : null
  if (rangeHeader) {
    const byteRange = parseSingleByteRange(rangeHeader, object.size)
    if (byteRange.status === 'invalid') {
      headers.set('Content-Range', `bytes */${object.size}`)
      return new Response(null, { headers, status: 416 })
    }

    const { end, length, offset } = byteRange.range
    headers.set('Content-Length', length.toString())
    headers.set('Content-Range', `bytes ${offset}-${end}/${object.size}`)

    if (request.method === 'HEAD') {
      return new Response(null, { headers, status: 206 })
    }

    const rangedObject = await bucket.get(asset.key, {
      range: { length, offset },
    })
    if (!rangedObject) return null

    return new Response(rangedObject.body, { headers, status: 206 })
  }

  headers.set('Content-Length', object.size.toString())
  if (request.method === 'HEAD') return new Response(null, { headers })

  const bodyObject = await bucket.get(asset.key)
  if (!bodyObject) return null

  return new Response(bodyObject.body, { headers })
}

export const getTokenAssetResponse = async (
  bucket: R2Bucket,
  asset: TokenAsset,
  request: Request,
): Promise<Response | null> => {
  const requiresMetadataFirst =
    request.method === 'HEAD' ||
    request.headers.has('If-None-Match') ||
    (asset.extension === 'mp4' && request.headers.has('Range'))

  if (requiresMetadataFirst) {
    return getMetadataFirst(bucket, asset, request)
  }

  const object = await bucket.get(asset.key)
  if (!object) return null

  const headers = getAssetHeaders(object, asset)
  headers.set('Content-Length', object.size.toString())
  return new Response(object.body, { headers })
}

export const hasRenderInput = async (
  bucket: R2Bucket,
  tokenId: string,
): Promise<boolean> => Boolean(await bucket.head(getRenderInputKey(tokenId)))

export const hasVerifiedTokenCompletion = async (
  bucket: R2Bucket,
  tokenId: string,
  rendererRevision: string,
): Promise<boolean> => {
  const marker = await bucket.get(getTokenCompletionKey(tokenId))
  if (!marker) return false
  if (
    marker.httpMetadata?.contentType !== 'application/json; charset=utf-8' ||
    marker.customMetadata?.['renderer-revision'] !== rendererRevision ||
    marker.customMetadata?.['runtime-adapter'] !== COMPLETION_RUNTIME_ADAPTER
  ) {
    return false
  }

  const markerBody = await marker.text()
  let value: unknown
  try {
    value = JSON.parse(markerBody)
  } catch {
    return false
  }

  const markerParams = { rendererRevision, tokenId, value }
  if (!isValidCompletionMarker(markerParams)) return false

  const objects = await Promise.all(
    markerParams.value.artifacts.map((artifact) => bucket.head(artifact.key)),
  )
  return markerParams.value.artifacts.every((artifact, index) =>
    matchesCompletionArtifact(objects[index], artifact, rendererRevision),
  )
}
