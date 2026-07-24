import { describe, expect, it, vi } from 'vitest'
import { makeMockEnv } from '#test-utils/env.js'
import app from './index'

const r2Object = (body: string): R2ObjectBody =>
  ({
    body: new Response(body).body,
    httpEtag: '"fixture-etag"',
    writeHttpMetadata: (headers: Headers) => {
      headers.set('Content-Type', 'application/json')
    },
  }) as R2ObjectBody

describe('commemorative NFT tokenURI route', () => {
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

  it('returns a retryable response while generation is unavailable', async () => {
    const bucket = {
      get: vi.fn(async () => null),
      head: vi.fn(async () => ({ key: 'render-input/42.json' })),
    } as unknown as R2Bucket
    const response = await app.request(
      '/v1/commemorative-nft/42.png',
      undefined,
      makeMockEnv({
        COMMEMORATIVE_NFT_BUCKET: bucket,
        COMMEMORATIVE_NFT_GENERATOR_URL: '',
      }),
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('15')
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
