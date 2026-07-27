import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeMockEnv } from '#test-utils/env.js'
import app from './index'

type GeneratorBindings = {
  readonly COMMEMORATIVE_NFT_GENERATOR_TOKEN?: string
  readonly COMMEMORATIVE_NFT_GENERATOR_URL?: string
}

const makeGeneratorEnv = (
  overrides: Partial<Omit<CloudflareBindings, keyof GeneratorBindings>> &
    GeneratorBindings,
): CloudflareBindings =>
  makeMockEnv(overrides as unknown as Partial<CloudflareBindings>)

const r2Object = (body: string): R2ObjectBody =>
  ({
    body: new Response(body).body,
    httpEtag: '"fixture-etag"',
    writeHttpMetadata: (headers: Headers) => {
      headers.set('Content-Type', 'application/json')
    },
  }) as R2ObjectBody

describe('commemorative NFT tokenURI route', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('serves an immutable token asset from R2', async () => {
    const bucket = {
      get: vi.fn(async () => r2Object('{"name":"yoginth"}')),
    } as unknown as R2Bucket
    const response = await app.request(
      '/v1/commemorative-nft/42.json',
      undefined,
      makeMockEnv({ COMMEMORATIVE_NFT_BUCKET: bucket }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('ETag')).toBe('"fixture-etag"')
    expect(response.headers.get('Cache-Control')).toContain('immutable')
    await expect(response.json()).resolves.toEqual({ name: 'yoginth' })
  })

  it('does not let a public cache miss enqueue generation', async () => {
    const generationRequest = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', generationRequest)
    const bucket = {
      get: vi.fn(async () => null),
      head: vi.fn(async () => ({ key: 'render-input/42.json' })),
    } as unknown as R2Bucket
    const response = await app.request(
      '/v1/commemorative-nft/42.png',
      undefined,
      makeGeneratorEnv({
        COMMEMORATIVE_NFT_BUCKET: bucket,
        COMMEMORATIVE_NFT_GENERATOR_TOKEN: 'secret',
        COMMEMORATIVE_NFT_GENERATOR_URL: 'https://generator.example',
      }),
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('15')
    expect(generationRequest).not.toHaveBeenCalled()
  })

  it('requires authentication to enqueue generation', async () => {
    const generationRequest = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', generationRequest)
    const response = await app.request(
      '/v1/commemorative-nft/42/prepare',
      { method: 'POST' },
      makeGeneratorEnv({
        COMMEMORATIVE_NFT_GENERATOR_TOKEN: 'secret',
        COMMEMORATIVE_NFT_GENERATOR_URL: 'https://generator.example',
      }),
    )

    expect(response.status).toBe(401)
    expect(generationRequest).not.toHaveBeenCalled()
  })

  it('lets an authenticated caller enqueue a known token', async () => {
    const generationRequest = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 202 }),
    )
    vi.stubGlobal('fetch', generationRequest)
    const bucket = {
      head: vi.fn(async () => ({ key: 'render-input/42.json' })),
    } as unknown as R2Bucket
    const response = await app.request(
      '/v1/commemorative-nft/42/prepare',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer secret' },
      },
      makeGeneratorEnv({
        COMMEMORATIVE_NFT_BUCKET: bucket,
        COMMEMORATIVE_NFT_GENERATOR_TOKEN: 'secret',
        COMMEMORATIVE_NFT_GENERATOR_URL: 'https://generator.example',
      }),
    )

    expect(response.status).toBe(202)
    expect(generationRequest).toHaveBeenCalledOnce()
    const [, init] = generationRequest.mock.calls[0]
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer secret',
    )
  })

  it('does not permit alternate extensions or path traversal', async () => {
    const response = await app.request(
      '/v1/commemorative-nft/42.svg',
      undefined,
      makeMockEnv(),
    )
    expect(response.status).toBe(404)
  })

  it('does not enqueue generation without a known render input', async () => {
    const bucket = {
      get: vi.fn(async () => null),
      head: vi.fn(async () => null),
    } as unknown as R2Bucket
    const response = await app.request(
      '/v1/commemorative-nft/43.json',
      undefined,
      makeMockEnv({ COMMEMORATIVE_NFT_BUCKET: bucket }),
    )
    expect(response.status).toBe(404)
  })
})
