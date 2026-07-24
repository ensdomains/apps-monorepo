import { describe, expect, it, vi } from 'vitest'
import { requestTokenGeneration } from './generation'

describe('commemorative NFT generation client', () => {
  it('does not call the network without configured generation', async () => {
    const fetcher = vi.fn<typeof fetch>()
    await expect(
      requestTokenGeneration({ tokenId: '42', fetcher }),
    ).resolves.toEqual({ status: 'unavailable' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('submits an authenticated idempotent prepare request', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 202 }),
    )
    await expect(
      requestTokenGeneration({
        tokenId: '42',
        generatorUrl: 'https://generator.example',
        generatorToken: 'secret',
        fetcher,
      }),
    ).resolves.toEqual({ status: 'accepted' })

    const [url, init] = fetcher.mock.calls[0]
    expect(url.toString()).toBe(
      'https://generator.example/v1/tokens/42/prepare',
    )
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer secret',
    )
  })

  it('reports upstream failures without treating them as a miss', async () => {
    await expect(
      requestTokenGeneration({
        tokenId: '42',
        generatorUrl: 'https://generator.example',
        fetcher: async () => new Response(null, { status: 500 }),
      }),
    ).resolves.toEqual({ status: 'failed', responseStatus: 500 })
  })
})
