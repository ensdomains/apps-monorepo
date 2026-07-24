const CACHE_CONTROL = 'public, max-age=31536000, immutable'

export const getTokenAsset = async (
  bucket: R2Bucket,
  key: string,
): Promise<R2ObjectBody | null> => bucket.get(key)

export const hasObject = async (
  bucket: R2Bucket,
  key: string,
): Promise<boolean> => Boolean(await bucket.head(key))

export const tokenAssetResponse = (
  object: R2ObjectBody,
  request: Request,
): Response => {
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('Cache-Control', CACHE_CONTROL)
  headers.set('ETag', object.httpEtag)

  if (request.headers.get('If-None-Match') === object.httpEtag) {
    return new Response(null, { status: 304, headers })
  }

  return new Response(request.method === 'HEAD' ? null : object.body, {
    headers,
  })
}
