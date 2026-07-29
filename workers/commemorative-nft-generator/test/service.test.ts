import { describe, expect, it, vi } from 'vitest'
import type { MediaCapture } from '../src/capture.js'
import { sha256Hex } from '../src/media.js'
import type { ObjectStore, PutObjectOptions, StoredObject } from '../src/r2.js'
import { TokenGenerationService } from '../src/service.js'

const INPUT = {
  animation_url: '',
  attributes: [
    { trait_type: 'Era', value: 'DeFi' },
    { trait_type: 'Depth', value: 'Collector' },
    { trait_type: 'Gasveteran', value: 'Seasoned' },
    { trait_type: 'Archetype', value: 'Abstract' },
    { trait_type: 'Rarity', value: 'Rare' },
    { trait_type: 'Seed', value: 3_780_441_947 },
  ],
  description: 'ENS commemorative',
  image: '',
  name: 'yoginth.eth',
}

type FakeStoredObject = {
  readonly metadata: StoredObject
  readonly value: Uint8Array | string
}

const setup = () => {
  const objects = new Map<string, FakeStoredObject>()
  const writes: string[] = []
  const json = new Map<string, unknown>([['render-input/42.json', INPUT]])
  const store: ObjectStore = {
    getJson: vi.fn(async (key) => json.get(key)),
    head: vi.fn(async (key) => objects.get(key)?.metadata),
    read: vi.fn(async (key) => {
      const object = objects.get(key)
      if (!object) return undefined
      const body =
        typeof object.value === 'string'
          ? new TextEncoder().encode(object.value)
          : object.value
      return { ...object.metadata, body }
    }),
    putImmutable: vi.fn(
      async (
        key: string,
        value: Uint8Array | string,
        options: PutObjectOptions,
      ) => {
        const sha256 = sha256Hex(value)
        const existing = objects.get(key)
        if (existing) {
          if (existing.metadata.sha256 !== sha256) {
            throw new Error(`immutable conflict: ${key}`)
          }
          return existing.metadata
        }

        const size =
          typeof value === 'string'
            ? new TextEncoder().encode(value).byteLength
            : value.byteLength
        const metadata = {
          contentType: options.contentType,
          rendererRevision: options.customMetadata['renderer-revision'],
          runtimeAdapter: options.customMetadata['runtime-adapter'],
          sha256,
          size,
        }
        objects.set(key, { metadata, value })
        writes.push(key)
        return metadata
      },
    ),
  }
  const capture: MediaCapture = {
    capture: vi.fn(async () => ({
      png: new Uint8Array([1, 2, 3]),
      mp4: new Uint8Array([4, 5, 6]),
    })),
  }
  const service = new TokenGenerationService({
    store,
    capture,
    publicAssetOrigin: 'https://app-api.example/v1/commemorative-nft',
    publicR2Origin: 'https://r2.example',
    rendererRevision: 'sha256:renderer',
  })

  return { capture, json, objects, service, store, writes }
}

describe('token generation service', () => {
  it('publishes metadata only after both media objects', async () => {
    const { objects, service, writes } = setup()
    await service.captureAndPersistMedia('42')
    expect(objects.has('tokens/42.json')).toBe(false)

    const record = await service.publishMetadata('42')
    expect(writes.at(-1)).toBe('tokens/42.json')
    expect(record).toMatchObject({
      rendererRevision: 'sha256:renderer',
      runtimeAdapter: 'container',
      tokenId: '42',
    })
    expect(
      JSON.parse(objects.get('tokens/42.json')?.value as string),
    ).toMatchObject({
      animation_url: 'https://app-api.example/v1/commemorative-nft/42.mp4',
      image: 'https://app-api.example/v1/commemorative-nft/42.png',
      name: 'yoginth.eth',
      properties: {
        renderer_revision: 'sha256:renderer',
        runtime_adapter: 'container',
      },
    })
  })

  it('recovers idempotently when one media write already succeeded', async () => {
    const { capture, objects, service, store } = setup()
    const originalPut = vi.mocked(store.putImmutable).getMockImplementation()
    if (!originalPut)
      throw new Error('Missing fake object store implementation')
    let shouldFailMp4 = true
    vi.mocked(store.putImmutable).mockImplementation(
      async (key, value, options) => {
        if (key.endsWith('.mp4') && shouldFailMp4) {
          shouldFailMp4 = false
          throw new Error('temporary R2 failure')
        }
        return originalPut(key, value, options)
      },
    )

    await expect(service.captureAndPersistMedia('42')).rejects.toThrow(
      'temporary R2 failure',
    )
    expect(objects.has('tokens/42.png')).toBe(true)
    await expect(service.captureAndPersistMedia('42')).resolves.toMatchObject({
      tokenId: '42',
    })
    expect(capture.capture).toHaveBeenCalledTimes(2)
  })

  it('verifies all artifact hashes and sizes', async () => {
    const { service } = setup()
    await service.captureAndPersistMedia('42')
    await service.publishMetadata('42')

    const record = await service.verifyArtifacts('42')
    expect(record.artifacts).toHaveLength(3)
    expect(
      record.artifacts.every(({ sha256, size }) => sha256 && size > 0),
    ).toBe(true)
  })

  it('re-reads bytes and rejects a forged hash or stale renderer revision', async () => {
    const { objects, service } = setup()
    await service.captureAndPersistMedia('42')
    await service.publishMetadata('42')

    const png = objects.get('tokens/42.png')
    if (!png) throw new Error('Missing PNG fixture')
    objects.set('tokens/42.png', {
      ...png,
      metadata: { ...png.metadata, sha256: '0'.repeat(64) },
    })
    await expect(service.verifyArtifacts('42')).rejects.toThrow(
      'failed SHA-256 verification',
    )

    objects.set('tokens/42.png', {
      ...png,
      metadata: {
        ...png.metadata,
        rendererRevision: 'sha256:old-renderer',
      },
    })
    await expect(service.verifyArtifacts('42')).rejects.toThrow(
      'stale runtime metadata',
    )
  })

  it('rejects missing render input as non-retryable', async () => {
    const { json, service } = setup()
    json.delete('render-input/42.json')
    await expect(service.captureAndPersistMedia('42')).rejects.toMatchObject({
      name: 'InvalidGenerationInputError',
    })
  })

  it('rejects malformed render-input JSON as non-retryable', async () => {
    const { service, store } = setup()
    vi.mocked(store.getJson).mockRejectedValueOnce(
      new SyntaxError('Unexpected token'),
    )

    await expect(service.captureAndPersistMedia('42')).rejects.toMatchObject({
      name: 'InvalidGenerationInputError',
    })
  })
})
