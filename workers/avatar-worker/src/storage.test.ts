import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { publishImage, readManifest } from './storage'
import { jpeg } from './test-utils/jpeg'
import app from './worker'

const key = 'sepolia/registered/alice.eth'
const pointerKey = `profile-media-v2/${key}/manifest`
const publish = (bucket: R2Bucket = env.MEDIA, revision = '') =>
  publishImage(bucket, key, revision, 'image/jpeg', jpeg)

const readBytes = async (key: string) => {
  const object = await env.MEDIA.get(key)
  if (!object) throw new Error(`Missing stored image: ${key}`)
  return new Uint8Array(await object.arrayBuffer())
}

beforeEach(async () => {
  for (const bucket of [env.MEDIA, env.HEADER_MEDIA]) {
    const objects = await bucket.list()
    await Promise.all(objects.objects.map(({ key }) => bucket.delete(key)))
  }
})

describe('legacy storage compatibility', () => {
  it.each([
    ['avatar', env.MEDIA, ''],
    ['header', env.HEADER_MEDIA, '/h'],
  ] as const)(
    'keeps the authorized %s bytes and revision after a legacy overwrite',
    async (_kind, bucket, suffix) => {
      const revision = await publish(bucket)
      await bucket.put(key, '<svg>legacy replacement</svg>', {
        httpMetadata: { contentType: 'image/svg+xml' },
      })
      const url = `https://media.test/sepolia/alice.eth${suffix}`
      const response = await app.fetch(new Request(url), env)
      expect(response.status).toBe(200)
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(jpeg)
      expect(response.headers.get('ETag')).toBe(`"${revision}"`)
      const metadata = await app.fetch(new Request(`${url}/meta`), env)
      expect(await metadata.json()).toEqual({ revision })
    },
  )

  it.each(['GET', 'HEAD'])(
    'serves a legacy JPEG with image/jpeg for %s despite its stored MIME',
    async (method) => {
      await env.MEDIA.put(key, jpeg, {
        httpMetadata: { contentType: 'text/html' },
      })
      const response = await app.fetch(
        new Request('https://media.test/sepolia/alice.eth', { method }),
        env,
      )
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('image/jpeg')
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(response.headers.get('Content-Length')).toBe(String(jpeg.length))
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(
        method === 'GET' ? jpeg : new Uint8Array(),
      )
    },
  )

  it('does not revive an old upload revision when legacy bytes and metadata are restored', async () => {
    const first = await publish()
    const oldObject = await env.MEDIA.get(key)
    if (!oldObject) throw new Error('Missing first canonical image')
    const oldBytes = await oldObject.arrayBuffer()
    const second = await publish(env.MEDIA, first)
    await env.MEDIA.put(key, oldBytes, {
      httpMetadata: oldObject.httpMetadata,
      customMetadata: oldObject.customMetadata,
    })
    await expect(publish(env.MEDIA, first)).rejects.toMatchObject({
      status: 409,
      code: 'STALE_REVISION',
    })
    expect((await readManifest(env.MEDIA, key))?.revision).toBe(second)
  })

  it.each([false, true])(
    'adopts an existing image with preview metadata=%s on its first authorized replacement',
    async (hasPreviewMetadata) => {
      if (hasPreviewMetadata) {
        await publish()
        await env.MEDIA.delete(pointerKey)
      } else await env.MEDIA.put(key, jpeg)
      const previous = await readManifest(env.MEDIA, key)
      if (!previous) throw new Error('Missing registered image')
      expect(await readBytes(previous.objectKey)).toEqual(jpeg)
      const revision = await publish(env.MEDIA, previous.revision)
      await env.MEDIA.delete(key)
      const manifest = await readManifest(env.MEDIA, key)
      expect(manifest?.revision).toBe(revision)
      expect(await readBytes(manifest?.objectKey ?? '')).toEqual(jpeg)
    },
  )

  it('fails closed instead of falling back when a protected pointer is malformed', async () => {
    await publish()
    await env.MEDIA.put(pointerKey, 'corrupted pointer')
    const response = await app.fetch(
      new Request('https://media.test/sepolia/alice.eth'),
      env,
    )
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({
      error: { code: 'INVALID_STORAGE_STATE' },
    })
  })

  it('rechecks the protected pointer when the first publication races a fallback read', async () => {
    await env.MEDIA.put(key, jpeg)
    let revision: string | undefined
    let hasPublished = false
    const bucket = {
      head: async (objectKey: string) => {
        const result = await env.MEDIA.head(objectKey)
        if (objectKey === pointerKey && !hasPublished) {
          hasPublished = true
          const previous = await readManifest(env.MEDIA, key)
          revision = await publish(env.MEDIA, previous?.revision)
          await env.MEDIA.put(key, 'legacy overwrite')
        }
        return result
      },
    } as R2Bucket
    const manifest = await readManifest(bucket, key)
    expect(manifest?.revision).toBe(revision)
    expect(await readBytes(manifest?.objectKey ?? '')).toEqual(jpeg)
  })
})

describe('conditional image publication in R2', () => {
  it('publishes a manifest pointing to the exact signed original bytes', async () => {
    const revision = await publish()
    const manifest = await readManifest(env.MEDIA, key)
    expect(manifest).toMatchObject({
      revision,
      size: jpeg.length,
      mimeType: 'image/jpeg',
    })
    expect(await readBytes(manifest?.objectKey ?? '')).toEqual(jpeg)
    const canonicalBytes = await readBytes(key)
    expect(canonicalBytes.slice(0, jpeg.length - 2)).toEqual(jpeg.slice(0, -2))
    expect(canonicalBytes.slice(-2)).toEqual(Uint8Array.of(0xff, 0xd9))
    expect(new TextDecoder().decode(canonicalBytes)).toContain(revision)
  })

  it('gives identical-image replacements distinct revisions and canonical ETags', async () => {
    const first = await publish()
    const before = await env.MEDIA.head(key)
    const second = await publish(env.MEDIA, first)
    const after = await env.MEDIA.head(key)
    expect(second).not.toBe(first)
    expect(after?.etag).not.toBe(before?.etag)
    expect((await readManifest(env.MEDIA, key))?.revision).toBe(second)
  })

  it('rejects a stale revision without changing storage', async () => {
    const revision = await publish()
    const before = await env.MEDIA.head(key)
    await expect(publish(env.MEDIA, 'stale')).rejects.toMatchObject({
      status: 409,
      code: 'STALE_REVISION',
    })
    expect((await readManifest(env.MEDIA, key))?.revision).toBe(revision)
    expect((await env.MEDIA.head(key))?.etag).toBe(before?.etag)
    expect((await env.MEDIA.list()).objects).toHaveLength(3)
  })

  it('allows one winner for concurrent writes against the same revision', async () => {
    const revision = await publish()
    const outcomes = await Promise.allSettled([
      publish(env.MEDIA, revision),
      publish(env.MEDIA, revision),
    ])
    const winners = outcomes.filter((result) => result.status === 'fulfilled')
    const losers = outcomes.filter((result) => result.status === 'rejected')
    expect(winners).toHaveLength(1)
    expect(losers).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({
          status: 409,
          code: 'STALE_REVISION',
        }),
      }),
    ])
    if (winners[0]?.status !== 'fulfilled')
      throw new Error('Missing publication winner')
    expect((await readManifest(env.MEDIA, key))?.revision).toBe(
      winners[0].value,
    )
    // Protected pointer, canonical image, previous and winning originals only.
    expect((await env.MEDIA.list()).objects).toHaveLength(4)
  })

  it('allows one winner for concurrent first uploads without a protected pointer', async () => {
    const outcomes = await Promise.allSettled([publish(), publish()])
    const winners = outcomes.filter((result) => result.status === 'fulfilled')
    expect(winners).toHaveLength(1)
    expect(outcomes.filter((result) => result.status === 'rejected')).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({ code: 'STALE_REVISION' }),
      }),
    ])
    expect((await env.MEDIA.list()).objects).toHaveLength(3)
  })

  it('removes only an unpublished original after a definite conditional-write loss', async () => {
    const revision = await publish()
    const bucket = {
      head: env.MEDIA.head.bind(env.MEDIA),
      delete: env.MEDIA.delete.bind(env.MEDIA),
      put: (
        objectKey: string,
        value: Parameters<R2Bucket['put']>[1],
        options: R2PutOptions,
      ) =>
        objectKey === pointerKey
          ? Promise.resolve(null)
          : env.MEDIA.put(objectKey, value, options),
    } as R2Bucket
    await expect(publish(bucket, revision)).rejects.toMatchObject({
      status: 409,
    })
    expect((await readManifest(env.MEDIA, key))?.revision).toBe(revision)
    expect((await env.MEDIA.list()).objects).toHaveLength(3)
  })

  it('retains a published original when the canonical-write response is lost', async () => {
    const revision = await publish()
    const bucket = {
      head: env.MEDIA.head.bind(env.MEDIA),
      delete: env.MEDIA.delete.bind(env.MEDIA),
      put: async (
        objectKey: string,
        value: Parameters<R2Bucket['put']>[1],
        options: R2PutOptions,
      ) => {
        const result = await env.MEDIA.put(objectKey, value, options)
        if (objectKey === key) throw new Error('write response lost')
        return result
      },
    } as R2Bucket
    await expect(publish(bucket, revision)).rejects.toThrow(
      'write response lost',
    )
    const manifest = await readManifest(env.MEDIA, key)
    expect(manifest?.revision).not.toBe(revision)
    expect(await readBytes(manifest?.objectKey ?? '')).toEqual(jpeg)
    expect((await env.MEDIA.list()).objects).toHaveLength(4)
  })

  it.each([false, true])(
    'retains the candidate after an ambiguous pointer write, committed=%s',
    async (isCommitted) => {
      const revision = await publish()
      const bucket = {
        head: env.MEDIA.head.bind(env.MEDIA),
        put: async (
          objectKey: string,
          value: Parameters<R2Bucket['put']>[1],
          options: R2PutOptions,
        ) => {
          if (objectKey === pointerKey) {
            if (isCommitted) await env.MEDIA.put(objectKey, value, options)
            throw new Error('pointer write response lost')
          }
          return env.MEDIA.put(objectKey, value, options)
        },
      } as R2Bucket
      await expect(publish(bucket, revision)).rejects.toThrow(
        'pointer write response lost',
      )
      const manifest = await readManifest(env.MEDIA, key)
      if (isCommitted) expect(manifest?.revision).not.toBe(revision)
      else expect(manifest?.revision).toBe(revision)
      expect(await readBytes(manifest?.objectKey ?? '')).toEqual(jpeg)
      expect((await env.MEDIA.list()).objects).toHaveLength(4)
    },
  )

  it('preserves committed v2 state when a concurrent legacy write prevents mirroring', async () => {
    const revision = await publish()
    const bucket = {
      head: env.MEDIA.head.bind(env.MEDIA),
      put: async (
        objectKey: string,
        value: Parameters<R2Bucket['put']>[1],
        options: R2PutOptions,
      ) => {
        if (objectKey === key) await env.MEDIA.put(key, 'legacy overwrite')
        return env.MEDIA.put(objectKey, value, options)
      },
    } as R2Bucket
    await expect(publish(bucket, revision)).rejects.toMatchObject({
      status: 503,
      code: 'IMAGE_UNAVAILABLE',
    })
    const manifest = await readManifest(env.MEDIA, key)
    expect(manifest?.revision).not.toBe(revision)
    expect(await readBytes(manifest?.objectKey ?? '')).toEqual(jpeg)
    expect((await env.MEDIA.list()).objects).toHaveLength(4)
  })

  it('does not mirror a delayed publication over a newer authorized replacement', async () => {
    const revision = await publish()
    let replacement: string | undefined
    const bucket = {
      head: env.MEDIA.head.bind(env.MEDIA),
      put: async (
        objectKey: string,
        value: Parameters<R2Bucket['put']>[1],
        options: R2PutOptions,
      ) => {
        const result = await env.MEDIA.put(objectKey, value, options)
        if (objectKey === pointerKey && result)
          replacement = await publish(env.MEDIA, String(value))
        return result
      },
    } as R2Bucket
    await publish(bucket, revision)
    expect((await readManifest(env.MEDIA, key))?.revision).toBe(replacement)
    expect(new TextDecoder().decode(await readBytes(key))).toContain(
      replacement,
    )
  })

  it('checks the pointer after reading the canonical ETag before mirroring', async () => {
    const revision = await publish()
    let replacement: string | undefined
    const bucket = {
      put: env.MEDIA.put.bind(env.MEDIA),
      head: async (objectKey: string) => {
        if (objectKey === key && !replacement) {
          const current = await readManifest(env.MEDIA, key)
          replacement = await publish(env.MEDIA, current?.revision)
        }
        return env.MEDIA.head(objectKey)
      },
    } as R2Bucket
    await publish(bucket, revision)
    expect((await readManifest(env.MEDIA, key))?.revision).toBe(replacement)
    expect(new TextDecoder().decode(await readBytes(key))).toContain(
      replacement,
    )
  })

  it('does not replace the canonical image when saving the original fails', async () => {
    const revision = await publish()
    const bucket = {
      head: env.MEDIA.head.bind(env.MEDIA),
      put: async () => {
        throw new Error('original write failed')
      },
    } as unknown as R2Bucket
    await expect(publish(bucket, revision)).rejects.toThrow(
      'original write failed',
    )
    expect((await readManifest(env.MEDIA, key))?.revision).toBe(revision)
    expect((await env.MEDIA.list()).objects).toHaveLength(3)
  })
})
