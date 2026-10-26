import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { publishImage, readManifest } from './storage'
import { jpeg } from './test-utils/jpeg'

const key = 'sepolia/registered/alice.eth'
const publish = (bucket: R2Bucket = env.MEDIA, revision = '') =>
  publishImage(bucket, key, revision, 'image/jpeg', jpeg)

const readBytes = async (key: string) => {
  const object = await env.MEDIA.get(key)
  if (!object) throw new Error(`Missing stored image: ${key}`)
  return new Uint8Array(await object.arrayBuffer())
}

beforeEach(async () => {
  const objects = await env.MEDIA.list()
  await Promise.all(objects.objects.map(({ key }) => env.MEDIA.delete(key)))
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
    expect((await env.MEDIA.list()).objects).toHaveLength(2)
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
    // Canonical image, previous immutable original and winning original only.
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
        objectKey === key
          ? Promise.resolve(null)
          : env.MEDIA.put(objectKey, value, options),
    } as R2Bucket
    await expect(publish(bucket, revision)).rejects.toMatchObject({
      status: 409,
    })
    expect((await readManifest(env.MEDIA, key))?.revision).toBe(revision)
    expect((await env.MEDIA.list()).objects).toHaveLength(2)
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
    expect((await env.MEDIA.list()).objects).toHaveLength(3)
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
    expect((await env.MEDIA.list()).objects).toHaveLength(2)
  })
})
