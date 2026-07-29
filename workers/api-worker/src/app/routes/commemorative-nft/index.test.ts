import { describe, expect, it, vi } from 'vitest'
import type {
  GenerationCoordinator,
  GenerationPreparationStatus,
} from '#services/commemorative-nft/generation.js'
import type {
  TokenOwnershipReader,
  TokenOwnershipStatus,
} from '#services/commemorative-nft/ownership.js'
import { makeMockEnv } from '#test-utils/env.js'
import { createCommemorativeNftApp } from './index'

interface Fixture {
  readonly body: string
  readonly contentType: string
}

type TestBindings = CloudflareBindings & {
  readonly COMMEMORATIVE_NFT_BUCKET: R2Bucket
}

const textEncoder = new TextEncoder()

const makeR2Object = (
  key: string,
  fixture: Fixture,
  body = textEncoder.encode(fixture.body),
): R2ObjectBody => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(body)
      controller.close()
    },
  })

  return {
    body: stream,
    httpEtag: `"${key}-etag"`,
    size: textEncoder.encode(fixture.body).byteLength,
    writeHttpMetadata: (headers: Headers) => {
      headers.set('Content-Type', fixture.contentType)
    },
  } as R2ObjectBody
}

const makeBucket = (fixtures: Readonly<Record<string, Fixture>>): R2Bucket => {
  const getFixture = (key: string): Fixture | undefined => fixtures[key]

  return {
    get: vi.fn(async (key: string, options?: R2GetOptions) => {
      const fixture = getFixture(key)
      if (!fixture) return null

      const bytes = textEncoder.encode(fixture.body)
      const range = options?.range
      if (range && 'offset' in range && range.offset !== undefined) {
        const offset = range.offset
        const end =
          range.length === undefined ? bytes.byteLength : offset + range.length
        return makeR2Object(key, fixture, bytes.slice(offset, end))
      }

      return makeR2Object(key, fixture)
    }),
    head: vi.fn(async (key: string) => {
      const fixture = getFixture(key)
      return fixture ? makeR2Object(key, fixture) : null
    }),
  } as unknown as R2Bucket
}

const makeFailingBucket = (): R2Bucket =>
  ({
    get: vi.fn(async () => {
      throw new Error('R2 unavailable')
    }),
    head: vi.fn(async () => {
      throw new Error('R2 unavailable')
    }),
  }) as unknown as R2Bucket

const makeEnv = (bucket: R2Bucket): TestBindings =>
  ({
    ...makeMockEnv(),
    COMMEMORATIVE_NFT_BUCKET: bucket,
  }) as TestBindings

const makeDependencies = (
  ownershipStatus: TokenOwnershipStatus = 'minted',
  preparationStatus: GenerationPreparationStatus = 'preparing',
) => {
  const getStatus = vi.fn<TokenOwnershipReader['getStatus']>(
    async () => ownershipStatus,
  )
  const prepare = vi.fn<GenerationCoordinator['prepare']>(
    async () => preparationStatus,
  )
  const app = createCommemorativeNftApp({
    createGenerationCoordinator: () => ({ prepare }),
    createTokenOwnershipReader: () => ({ getStatus }),
  })

  return { app, getStatus, prepare }
}

const JSON_FIXTURE = {
  body: '{"name":"commemorative"}',
  contentType: 'application/json',
} as const

const MP4_FIXTURE = {
  body: '0123456789',
  contentType: 'video/mp4',
} as const

const RENDER_INPUT_FIXTURE = {
  body: '{"seed":42}',
  contentType: 'application/json',
} as const

const makeKnownBucket = (
  fixtures: Readonly<Record<string, Fixture>>,
): R2Bucket =>
  makeBucket({
    'render-input/42.json': RENDER_INPUT_FIXTURE,
    ...fixtures,
  })

describe('commemorative NFT asset routes', () => {
  it('serves immutable assets from R2', async () => {
    const { app } = makeDependencies()
    const response = await app.request(
      '/v1/commemorative-nft/42.json',
      undefined,
      makeEnv(
        makeKnownBucket({
          'tokens/42.json': JSON_FIXTURE,
          'tokens/42.mp4': MP4_FIXTURE,
          'tokens/42.png': {
            body: 'png',
            contentType: 'image/png',
          },
        }),
      ),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toContain('immutable')
    expect(response.headers.get('ETag')).toBe('"tokens/42.json-etag"')
    expect(response.headers.get('Content-Length')).toBe(
      JSON_FIXTURE.body.length.toString(),
    )
    await expect(response.json()).resolves.toEqual({ name: 'commemorative' })
  })

  it('returns 304 for matching ETags', async () => {
    const { app } = makeDependencies()
    const response = await app.request(
      '/v1/commemorative-nft/42.json',
      { headers: { 'If-None-Match': 'W/"tokens/42.json-etag"' } },
      makeEnv(
        makeKnownBucket({
          'tokens/42.json': JSON_FIXTURE,
          'tokens/42.mp4': MP4_FIXTURE,
          'tokens/42.png': {
            body: 'png',
            contentType: 'image/png',
          },
        }),
      ),
    )

    expect(response.status).toBe(304)
    expect(await response.text()).toBe('')
  })

  it('handles HEAD without reading an object body', async () => {
    const bucket = makeKnownBucket({ 'tokens/42.mp4': MP4_FIXTURE })
    const { app } = makeDependencies()
    const response = await app.request(
      '/v1/commemorative-nft/42.mp4',
      { method: 'HEAD' },
      makeEnv(bucket),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    expect(response.headers.get('Content-Length')).toBe('10')
    expect(await response.text()).toBe('')
    expect(bucket.get).not.toHaveBeenCalled()
  })

  it('serves one MP4 byte range', async () => {
    const { app } = makeDependencies()
    const response = await app.request(
      '/v1/commemorative-nft/42.mp4',
      { headers: { Range: 'bytes=2-5' } },
      makeEnv(makeKnownBucket({ 'tokens/42.mp4': MP4_FIXTURE })),
    )

    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Range')).toBe('bytes 2-5/10')
    expect(response.headers.get('Content-Length')).toBe('4')
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe('2345')
  })

  it.each([
    'bytes=20-',
    'bytes=0-1,3-4',
  ])('rejects an invalid MP4 range: %s', async (range) => {
    const { app } = makeDependencies()
    const response = await app.request(
      '/v1/commemorative-nft/42.mp4',
      { headers: { Range: range } },
      makeEnv(makeKnownBucket({ 'tokens/42.mp4': MP4_FIXTURE })),
    )

    expect(response.status).toBe(416)
    expect(response.headers.get('Content-Range')).toBe('bytes */10')
  })

  it.each([
    '/v1/commemorative-nft/042.json',
    '/v1/commemorative-nft/42.svg',
    `/v1/commemorative-nft/${2n ** 256n}.json`,
  ])('returns 404 for an invalid asset path: %s', async (path) => {
    const { app, getStatus, prepare } = makeDependencies()
    const response = await app.request(path, undefined, makeEnv(makeBucket({})))

    expect(response.status).toBe(404)
    expect(getStatus).not.toHaveBeenCalled()
    expect(prepare).not.toHaveBeenCalled()
  })

  it('returns 404 for an unknown render input', async () => {
    const { app, getStatus, prepare } = makeDependencies()
    const response = await app.request(
      '/v1/commemorative-nft/42.png',
      undefined,
      makeEnv(
        makeBucket({
          'tokens/42.png': { body: 'orphan', contentType: 'image/png' },
        }),
      ),
    )

    expect(response.status).toBe(404)
    expect(getStatus).not.toHaveBeenCalled()
    expect(prepare).not.toHaveBeenCalled()
  })

  it('does not serve metadata before both media assets exist', async () => {
    const { app, prepare } = makeDependencies('minted', 'preparing')
    const response = await app.request(
      '/v1/commemorative-nft/42.json',
      undefined,
      makeEnv(
        makeBucket({
          'render-input/42.json': RENDER_INPUT_FIXTURE,
          'tokens/42.json': JSON_FIXTURE,
          'tokens/42.png': {
            body: 'png',
            contentType: 'image/png',
          },
        }),
      ),
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('15')
    expect(prepare).toHaveBeenCalledWith('42')
  })

  it('returns 404 for a known but unminted token', async () => {
    const { app, prepare } = makeDependencies('unminted')
    const response = await app.request(
      '/v1/commemorative-nft/42.png',
      undefined,
      makeEnv(
        makeKnownBucket({
          'tokens/42.png': { body: 'png', contentType: 'image/png' },
        }),
      ),
    )

    expect(response.status).toBe(404)
    expect(prepare).not.toHaveBeenCalled()
  })

  it('starts generation for a minted miss and returns retryable 503', async () => {
    const { app, prepare } = makeDependencies('minted', 'preparing')
    const response = await app.request(
      '/v1/commemorative-nft/42.png',
      undefined,
      makeEnv(makeBucket({ 'render-input/42.json': RENDER_INPUT_FIXTURE })),
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('15')
    expect(prepare).toHaveBeenCalledWith('42')
  })

  it('returns retryable 503 when ownership cannot be read', async () => {
    const { app, prepare } = makeDependencies('unavailable')
    const response = await app.request(
      '/v1/commemorative-nft/42.png',
      undefined,
      makeEnv(makeBucket({ 'render-input/42.json': RENDER_INPUT_FIXTURE })),
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('15')
    expect(prepare).not.toHaveBeenCalled()
  })

  it('returns retryable 503 when R2 reads fail', async () => {
    const { app, prepare } = makeDependencies()
    const response = await app.request(
      '/v1/commemorative-nft/42.png',
      undefined,
      makeEnv(makeFailingBucket()),
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Retry-After')).toBe('15')
    expect(prepare).not.toHaveBeenCalled()
  })
})

describe('commemorative NFT prepare route', () => {
  it('returns 404 for invalid or unknown token IDs', async () => {
    const { app, getStatus, prepare } = makeDependencies()
    const env = makeEnv(makeBucket({}))

    expect(
      (
        await app.request(
          '/v1/commemorative-nft/042/prepare',
          { method: 'POST' },
          env,
        )
      ).status,
    ).toBe(404)
    expect(
      (
        await app.request(
          '/v1/commemorative-nft/42/prepare',
          { method: 'POST' },
          env,
        )
      ).status,
    ).toBe(404)
    expect(getStatus).not.toHaveBeenCalled()
    expect(prepare).not.toHaveBeenCalled()
  })

  it('returns 200 after verifying ownership when all three assets exist', async () => {
    const { app, getStatus, prepare } = makeDependencies()
    const response = await app.request(
      '/v1/commemorative-nft/42/prepare',
      { method: 'POST' },
      makeEnv(
        makeBucket({
          'render-input/42.json': RENDER_INPUT_FIXTURE,
          'tokens/42.json': JSON_FIXTURE,
          'tokens/42.mp4': MP4_FIXTURE,
          'tokens/42.png': {
            body: 'png',
            contentType: 'image/png',
          },
        }),
      ),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: 'ready' })
    expect(getStatus).toHaveBeenCalledWith('42')
    expect(prepare).not.toHaveBeenCalled()
  })

  it('returns 409 for a known unminted token', async () => {
    const { app, prepare } = makeDependencies('unminted')
    const response = await app.request(
      '/v1/commemorative-nft/42/prepare',
      { method: 'POST' },
      makeEnv(makeBucket({ 'render-input/42.json': RENDER_INPUT_FIXTURE })),
    )

    expect(response.status).toBe(409)
    expect(prepare).not.toHaveBeenCalled()
  })

  it('returns 503 when Sepolia ownership is unavailable', async () => {
    const { app, prepare } = makeDependencies('unavailable')
    const response = await app.request(
      '/v1/commemorative-nft/42/prepare',
      { method: 'POST' },
      makeEnv(makeBucket({ 'render-input/42.json': RENDER_INPUT_FIXTURE })),
    )

    expect(response.status).toBe(503)
    expect(prepare).not.toHaveBeenCalled()
  })

  it.each([
    ['preparing', 202],
    ['rate-limited', 429],
    ['unavailable', 503],
  ] as const)('maps coordinator %s to HTTP %s', async (preparationStatus, expectedStatus) => {
    const { app, prepare } = makeDependencies('minted', preparationStatus)
    const response = await app.request(
      '/v1/commemorative-nft/42/prepare',
      { method: 'POST' },
      makeEnv(makeBucket({ 'render-input/42.json': RENDER_INPUT_FIXTURE })),
    )

    expect(response.status).toBe(expectedStatus)
    expect(prepare).toHaveBeenCalledWith('42')
  })

  it('returns retryable 503 when the preparation completeness check fails', async () => {
    const { app, prepare } = makeDependencies()
    const response = await app.request(
      '/v1/commemorative-nft/42/prepare',
      { method: 'POST' },
      makeEnv(makeFailingBucket()),
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('15')
    expect(prepare).not.toHaveBeenCalled()
  })
})
