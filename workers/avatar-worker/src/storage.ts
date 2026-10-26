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

const manifestKey = (key: string) => `profile-media-v2/${key}/manifest`

export const readManifest = async (bucket: R2Bucket, key: string) => {
  const initialPointer = await bucket.head(manifestKey(key))
  const legacy = initialPointer ? null : await bucket.head(key)
  // The first protected publication may race the legacy read. Recheck before
  // returning that fallback, even when the canonical object was absent.
  const pointer = initialPointer ?? (await bucket.head(manifestKey(key)))
  const object = pointer ?? legacy
  if (!object) return null
  const metadata = object.customMetadata
  const managed = metadata?.profileMediaVersion === '2'
  const objectKey = managed ? metadata.profileMediaObjectKey : key
  const revision = managed
    ? metadata.profileMediaRevision
    : `legacy-${object.etag}-${object.uploaded.getTime()}`
  const size = managed ? Number(metadata.profileMediaSize) : object.size
  if (
    (pointer && !managed) ||
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
    mimeType: 'image/jpeg',
    size,
    etag: object.etag,
    publicationEtag: pointer?.etag,
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
  const metadata = {
    profileMediaVersion: '2',
    profileMediaRevision: nextRevision,
    profileMediaObjectKey: objectKey,
    profileMediaSize: String(bytes.byteLength),
  }
  // This is the publication boundary. Legacy writers never touch this key,
  // so overwriting their canonical JPEG cannot replace or rewind v2 state.
  // Retain the original on ambiguous failures: this write may have committed.
  const published = await bucket.put(manifestKey(key), nextRevision, {
    onlyIf: previous?.publicationEtag
      ? { etagMatches: previous.publicationEtag }
      : new Headers({ 'If-None-Match': '*' }),
    httpMetadata: { contentType: 'text/plain' },
    customMetadata: metadata,
  })
  if (!published) {
    await bucket.delete(objectKey)
    throw new MediaError(
      409,
      'STALE_REVISION',
      'This image changed. Sign a fresh upload and try again.',
    )
  }
  // Mirror only a still-current publication. Read the canonical ETag before
  // checking the pointer, then condition its replacement so a delayed mirror
  // cannot overwrite a newer mirror. A mirror failure never rolls back v2.
  const legacy = await bucket.head(key)
  const current = await bucket.head(manifestKey(key))
  if (current?.etag !== published.etag) return nextRevision
  const mirrored = await bucket.put(key, legacyBytes, {
    onlyIf: legacy
      ? { etagMatches: legacy.etag }
      : new Headers({ 'If-None-Match': '*' }),
    httpMetadata: { contentType: mimeType },
    customMetadata: metadata,
  })
  if (!mirrored)
    throw new MediaError(
      503,
      'IMAGE_UNAVAILABLE',
      'Image publication is temporarily unavailable',
    )
  return nextRevision
}
