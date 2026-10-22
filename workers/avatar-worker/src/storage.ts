import type {
  ProfileImageKind,
  ProfileImageMime,
} from '@ens-apps/shared-schema/profile-media'
import { MediaError } from './error'

export const mediaKey = (
  network: string,
  name: string,
  _kind: ProfileImageKind,
) => `${network}/registered/${name}`

export const readManifest = async (bucket: R2Bucket, key: string) => {
  const object = await bucket.head(key)
  if (!object) return null
  const metadata = object.customMetadata
  const managed = metadata?.profileMediaVersion === '2'
  const objectKey = managed ? metadata.profileMediaObjectKey : key
  const revision = managed
    ? metadata.profileMediaRevision
    : `legacy-${object.etag}-${object.uploaded.getTime()}`
  const size = managed ? Number(metadata.profileMediaSize) : object.size
  if (
    !objectKey ||
    !revision ||
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    (managed && !objectKey.startsWith(`profile-media-v2/${key}/objects/`))
  )
    throw new MediaError(
      500,
      'INVALID_STORAGE_STATE',
      'Image storage is unavailable',
    )
  return {
    revision,
    objectKey,
    mimeType: object.httpMetadata?.contentType ?? 'application/octet-stream',
    size,
    etag: object.etag,
  }
}

export const publishImage = async (
  bucket: R2Bucket,
  key: string,
  revision: string,
  mimeType: ProfileImageMime,
  bytes: Uint8Array,
) => {
  const previous = await readManifest(bucket, key)
  if ((previous?.revision ?? '') !== revision)
    throw new MediaError(
      409,
      'STALE_REVISION',
      'This image changed. Sign a fresh upload and try again.',
    )
  const nextRevision = crypto.randomUUID()
  // R2 ETags depend on bytes, not custom metadata. A JPEG COM marker gives
  // each published revision distinct bytes even when identical images are
  // uploaded, preventing stale ETag reuse (including A -> B -> A races).
  // The immutable original is served by this worker; legacy readers see the
  // same JPEG pixels with this standard, non-rendering comment segment.
  const comment = new TextEncoder().encode(`ENS profile media ${nextRevision}`)
  const legacyBytes = new Uint8Array(bytes.length + comment.length + 4)
  legacyBytes.set(bytes.subarray(0, -2))
  legacyBytes.set(
    [0xff, 0xfe, (comment.length + 2) >> 8, (comment.length + 2) & 0xff],
    bytes.length - 2,
  )
  legacyBytes.set(comment, bytes.length + 2)
  legacyBytes.set([0xff, 0xd9], legacyBytes.length - 2)
  const objectKey = `profile-media-v2/${key}/objects/${nextRevision}`
  await bucket.put(objectKey, bytes, {
    httpMetadata: { contentType: mimeType },
  })
  // The legacy URL reads this same object. Its bytes and manifest metadata
  // change atomically, so concurrent uploads cannot leave the two URLs split.
  // Ambiguous storage failures retain the object: the conditional write may
  // already have committed. A definite precondition failure is safe to clean up.
  const written = await bucket.put(key, legacyBytes, {
    onlyIf: previous
      ? { etagMatches: previous.etag }
      : new Headers({ 'If-None-Match': '*' }),
    httpMetadata: { contentType: mimeType },
    customMetadata: {
      profileMediaVersion: '2',
      profileMediaRevision: nextRevision,
      profileMediaObjectKey: objectKey,
      profileMediaSize: String(bytes.byteLength),
    },
  })
  if (!written) {
    await bucket.delete(objectKey)
    throw new MediaError(
      409,
      'STALE_REVISION',
      'This image changed. Sign a fresh upload and try again.',
    )
  }
  return nextRevision
}
