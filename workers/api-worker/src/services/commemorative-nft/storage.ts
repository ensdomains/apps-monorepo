import {
  getRenderInputKey,
  getTokenAssetKey,
  TOKEN_ASSET_EXTENSIONS,
  type TokenAsset,
} from './assets'

const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'

const CONTENT_TYPES = {
  json: 'application/json',
  mp4: 'video/mp4',
  png: 'image/png',
} as const

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

export const hasCompleteTokenAssets = async (
  bucket: R2Bucket,
  tokenId: string,
): Promise<boolean> => {
  const assets = await Promise.all(
    TOKEN_ASSET_EXTENSIONS.map((extension) =>
      bucket.head(getTokenAssetKey(tokenId, extension)),
    ),
  )

  return assets.every(Boolean)
}

export const hasCompleteTokenMedia = async (
  bucket: R2Bucket,
  tokenId: string,
): Promise<boolean> => {
  const media = await Promise.all(
    (['mp4', 'png'] as const).map((extension) =>
      bucket.head(getTokenAssetKey(tokenId, extension)),
    ),
  )

  return media.every(Boolean)
}
