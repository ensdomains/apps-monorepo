import {
  inspectProfileImage,
  MAX_PROFILE_IMAGE_BYTES,
  MAX_PROFILE_UPLOAD_BYTES,
  PROFILE_UPLOAD_VALIDITY_MS,
  type ProfileImageKind,
  profileUploadSchema,
} from '@ens-apps/shared-schema/profile-media'
import { Hono } from 'hono'
import * as v from 'valibot'
import { sha256 } from 'viem'
import { normalize } from 'viem/ens'
import { authorizeUpload } from './auth'
import { MediaError } from './error'
import { mediaKey, publishImage, readManifest } from './storage'

const app = new Hono<{ Bindings: AvatarWorkerEnv }>()

const allowedOrigin = (origin: string, configured: string) => {
  try {
    const actual = new URL(origin)
    if (actual.origin !== origin) return false
    return configured.split(',').some((entry) => {
      const pattern = entry.trim()
      if (!pattern.includes('://*.')) return pattern === origin
      const base = new URL(pattern.replace('://*.', '://'))
      return (
        actual.protocol === base.protocol &&
        actual.port === base.port &&
        (actual.hostname === base.hostname ||
          actual.hostname.endsWith(`.${base.hostname}`))
      )
    })
  } catch {
    return false
  }
}

app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Cache-Control', 'no-store')
  const origin = c.req.header('Origin')
  const writing = c.req.method === 'PUT' || c.req.method === 'OPTIONS'
  if (writing && origin && !allowedOrigin(origin, c.env.ALLOWED_UPLOAD_ORIGINS))
    throw new MediaError(
      403,
      'ORIGIN_NOT_ALLOWED',
      'Upload origin is not allowed',
    )
  c.header('Access-Control-Allow-Origin', writing && origin ? origin : '*')
  c.header('Access-Control-Expose-Headers', 'ETag, Content-Length')
  if (writing && origin) c.header('Vary', 'Origin')
  if (c.req.method === 'OPTIONS') {
    c.header('Access-Control-Allow-Methods', 'GET, HEAD, PUT, OPTIONS')
    c.header('Access-Control-Allow-Headers', 'Content-Type, If-None-Match')
    return c.body(null, 204)
  }
  await next()
})

app.get('/health', (c) =>
  c.json({ status: 'ok', version: c.env.VERSION, commit: c.env.SOURCE_COMMIT }),
)

const boundedJson = async (request: Request) => {
  if (Number(request.headers.get('Content-Length')) > MAX_PROFILE_UPLOAD_BYTES)
    throw new MediaError(
      413,
      'REQUEST_TOO_LARGE',
      'Image upload request is too large',
    )
  if (
    request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !==
    'application/json'
  )
    throw new MediaError(415, 'JSON_REQUIRED', 'Upload body must be JSON')
  if (!request.body)
    throw new MediaError(400, 'INVALID_BODY', 'Upload body is missing')
  const reader = request.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_PROFILE_UPLOAD_BYTES) {
        throw new MediaError(
          413,
          'REQUEST_TOO_LARGE',
          'Image upload request is too large',
        )
      }
      parts.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let cursor = 0
  for (const part of parts) {
    bytes.set(part, cursor)
    cursor += part.length
  }
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes),
    ) as unknown
  } catch {
    throw new MediaError(400, 'INVALID_JSON', 'Upload body is not valid JSON')
  }
}

app.all('*', async (c) => {
  const segments = new URL(c.req.url).pathname.split('/').slice(1)
  const network = segments[0] === 'sepolia' ? 'sepolia' : 'mainnet'
  if (network === 'sepolia') segments.shift()
  else if (segments.length > 1 && !segments[0]?.endsWith('.eth'))
    throw new MediaError(
      400,
      'UNSUPPORTED_NETWORK',
      'Only mainnet and Sepolia are supported',
    )
  const encodedName = segments.shift() ?? ''
  let name: string
  try {
    name = decodeURIComponent(encodedName)
    if (normalize(name) !== name || !name.endsWith('.eth') || name === 'eth')
      throw new Error()
  } catch {
    throw new MediaError(
      400,
      'INVALID_NAME',
      'A normalized ENSv2 .eth name is required',
    )
  }
  const kind: ProfileImageKind = segments[0] === 'h' ? 'header' : 'avatar'
  if (kind === 'header') segments.shift()
  const meta = segments[0] === 'meta'
  if (meta) segments.shift()
  if (segments.length)
    throw new MediaError(404, 'ROUTE_NOT_FOUND', 'Image route not found')
  const key = mediaKey(network, name, kind)
  const bucket = kind === 'header' ? c.env.HEADER_MEDIA : c.env.MEDIA

  if (c.req.method === 'GET' || c.req.method === 'HEAD') {
    const manifest = await readManifest(bucket, key)
    if (meta) return c.json({ revision: manifest?.revision ?? '' })
    if (!manifest)
      throw new MediaError(404, 'IMAGE_NOT_FOUND', 'No image has been uploaded')
    const etag = `"${manifest.revision}"`
    c.header('Cache-Control', 'public, max-age=0, must-revalidate')
    c.header('ETag', etag)
    if (
      c.req
        .header('If-None-Match')
        ?.split(',')
        .some(
          (value) =>
            value.trim().replace(/^W\//, '') === etag || value.trim() === '*',
        )
    )
      return c.body(null, 304)
    c.header('Content-Type', manifest.mimeType)
    if (c.req.method === 'HEAD') {
      c.header('Content-Length', String(manifest.size))
      return c.body(null)
    }
    const object = await bucket.get(
      manifest.objectKey,
      manifest.objectKey === key
        ? { onlyIf: { etagMatches: manifest.etag } }
        : undefined,
    )
    if (!object || !('body' in object))
      throw new MediaError(
        503,
        'IMAGE_UNAVAILABLE',
        'Image storage is temporarily unavailable',
      )
    c.header('Content-Length', String(manifest.size))
    return c.body(object.body)
  }
  if (c.req.method !== 'PUT' || meta)
    throw new MediaError(
      405,
      'METHOD_NOT_ALLOWED',
      'This route supports image reads and uploads only',
    )
  if (
    !(
      await c.env.UPLOAD_IP_LIMIT.limit({
        key: c.req.header('CF-Connecting-IP') ?? 'local',
      })
    ).success
  )
    throw new MediaError(
      429,
      'RATE_LIMITED',
      'Too many image uploads. Try again shortly.',
    )
  const parsed = v.safeParse(profileUploadSchema, await boundedJson(c.req.raw))
  if (!parsed.success)
    throw new MediaError(400, 'INVALID_UPLOAD', 'Invalid upload fields')
  const upload = parsed.output
  if (
    upload.name !== name ||
    upload.kind !== kind ||
    upload.chainId !== (network === 'mainnet' ? 1 : 11155111) ||
    upload.service !== c.env.SERVICE_ORIGIN
  )
    throw new MediaError(
      400,
      'UPLOAD_TARGET_MISMATCH',
      'Upload signature target does not match this endpoint',
    )
  const expiry = Number(upload.expiry)
  if (expiry <= Date.now() || expiry > Date.now() + PROFILE_UPLOAD_VALIDITY_MS)
    throw new MediaError(
      403,
      'INVALID_EXPIRY',
      'Upload signature has expired or its validity is too long',
    )
  const data = /^data:(image\/jpeg);base64,([A-Za-z0-9+/]*={0,2})$/.exec(
    upload.dataURL,
  )
  if (!data || data[1] !== upload.mimeType || (data[2]?.length ?? 0) % 4)
    throw new MediaError(
      415,
      'INVALID_IMAGE',
      'Image data is not a supported base64 image',
    )
  let bytes: Uint8Array
  try {
    bytes = Uint8Array.from(atob(data[2] ?? ''), (char) => char.charCodeAt(0))
  } catch {
    throw new MediaError(
      400,
      'INVALID_BASE64',
      'Image data is not valid base64',
    )
  }
  if (bytes.byteLength > MAX_PROFILE_IMAGE_BYTES)
    throw new MediaError(413, 'IMAGE_TOO_LARGE', 'Image must be at most 3 MiB')
  if (inspectProfileImage(bytes)?.mimeType !== upload.mimeType)
    throw new MediaError(
      415,
      'INVALID_IMAGE',
      'Image bytes do not match a valid supported image',
    )
  if (sha256(bytes) !== upload.hash.toLowerCase())
    throw new MediaError(
      400,
      'HASH_MISMATCH',
      'Image hash does not match the upload',
    )
  await authorizeUpload(c.env, upload, network)
  if (expiry <= Date.now())
    throw new MediaError(
      403,
      'INVALID_EXPIRY',
      'Upload signature expired during verification',
    )
  const revision = await publishImage(
    bucket,
    key,
    upload.revision,
    upload.mimeType,
    bytes,
  )
  return c.json({ message: 'uploaded', revision })
})

app.onError((error, c) => {
  if (error instanceof MediaError) {
    if (error.status === 429 || error.status === 503)
      c.header('Retry-After', '60')
    return c.json(
      { error: { code: error.code, message: error.message } },
      error.status,
    )
  }
  console.error(
    JSON.stringify({ event: 'profile_media_failure', error: error.name }),
  )
  c.header('Retry-After', '60')
  return c.json(
    {
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Image upload service is temporarily unavailable',
      },
    },
    503,
  )
})

export default app
