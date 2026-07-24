import { describe, expect, it, vi } from 'vitest'
import type { MediaCapture } from '../src/capture.js'
import type { ObjectStore, PutObjectOptions } from '../src/r2.js'
import { TokenGenerationService } from '../src/service.js'

const INPUT = {
  name: 'yoginth',
  description: 'ENS commemorative',
  image: '',
  animation_url: '',
  attributes: [
    { trait_type: 'Era', value: 'DeFi' },
    { trait_type: 'Depth', value: 'Collector' },
    { trait_type: 'Gasveteran', value: 'Fresh' },
    { trait_type: 'Archetype', value: 'Abstract' },
    { trait_type: 'Rarity', value: 'Common' },
    { trait_type: 'Seed', value: 3_780_441_947 },
  ],
}

const setup = (captureGate: Promise<void> = Promise.resolve()) => {
  const objects = new Map<string, unknown>([['render-input/42.json', INPUT]])
  const writes: string[] = []
  const store: ObjectStore = {
    exists: vi.fn(async (key) => objects.has(key)),
    getJson: vi.fn(async (key) => objects.get(key)),
    put: vi.fn(
      async (
        key: string,
        value: ArrayBuffer | Uint8Array | string,
        _options: PutObjectOptions,
      ) => {
        objects.set(key, value)
        writes.push(key)
      },
    ),
  }
  const capture: MediaCapture = {
    capture: vi.fn(async () => {
      await captureGate
      return {
        png: new Uint8Array([1, 2, 3]),
        mp4: new Uint8Array([4, 5, 6]),
      }
    }),
  }
  const service = new TokenGenerationService({
    store,
    capture,
    publicAssetOrigin: 'https://assets.example/tokens',
    publicR2Origin: 'https://assets.example',
  })
  return { capture, objects, service, writes }
}

describe('token generation service', () => {
  it('deduplicates a running job and publishes metadata last', async () => {
    let releaseCapture: () => void = () => undefined
    const captureGate = new Promise<void>((resolve) => {
      releaseCapture = resolve
    })
    const { capture, objects, service, writes } = setup(captureGate)
    await expect(service.prepare('42')).resolves.toEqual({ status: 'started' })
    await expect(service.prepare('42')).resolves.toEqual({
      status: 'in-progress',
    })
    releaseCapture()
    await service.waitForIdle()

    expect(capture.capture).toHaveBeenCalledTimes(1)
    expect(writes.at(-1)).toBe('tokens/42.json')
    expect(JSON.parse(objects.get('tokens/42.json') as string)).toMatchObject({
      image: 'https://assets.example/tokens/42.png',
      animation_url: 'https://assets.example/tokens/42.mp4',
      name: 'yoginth',
    })
  })

  it('does not render an already complete token', async () => {
    const { capture, objects, service } = setup()
    objects.set('tokens/42.json', '{}')
    objects.set('tokens/42.png', new Uint8Array([1]))
    objects.set('tokens/42.mp4', new Uint8Array([1]))

    await expect(service.prepare('42')).resolves.toEqual({
      status: 'already-generated',
    })
    expect(capture.capture).not.toHaveBeenCalled()
  })
})
