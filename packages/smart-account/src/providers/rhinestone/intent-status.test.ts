import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchIntentOperationStatus } from './intent-status'

const INTENT_ID =
  489586857553873444664398961235893955864995340015236006735628257036465747n

const respondWith = (body: unknown, status = 200) =>
  vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }))

describe('fetchIntentOperationStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the status and hits the by-id endpoint with the api key', async () => {
    const fetch = respondWith({ status: 'COMPLETED' })
    vi.stubGlobal('fetch', fetch)

    const status = await fetchIntentOperationStatus({
      intentId: INTENT_ID,
      auth: { mode: 'apiKey', apiKey: 'rs_test' },
    })

    expect(status).toBe('COMPLETED')
    // The id must go out in DECIMAL: the orchestrator 404s on hex.
    expect(fetch).toHaveBeenCalledWith(
      `https://v1.orchestrator.rhinestone.dev/intent-operation/${INTENT_ID.toString()}`,
      expect.objectContaining({ headers: { 'x-api-key': 'rs_test' } }),
    )
  })

  it('sends a bearer token in jwt mode, the way the SDK does', async () => {
    const fetch = respondWith({ status: 'COMPLETED' })
    vi.stubGlobal('fetch', fetch)

    await fetchIntentOperationStatus({
      intentId: 1n,
      auth: { mode: 'jwt', getAccessToken: async () => 'tok' },
    })

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { Authorization: 'Bearer tok', 'x-api-key': 'jwt' },
      }),
    )
  })

  it('is inconclusive (null) when no access token can be minted', async () => {
    const fetch = respondWith({ status: 'COMPLETED' })
    vi.stubGlobal('fetch', fetch)

    await expect(
      fetchIntentOperationStatus({
        intentId: 1n,
        auth: {
          mode: 'jwt',
          getAccessToken: async () => {
            throw new Error('token endpoint down')
          },
        },
      }),
    ).resolves.toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('honors an endpoint override, without doubling slashes', async () => {
    const fetch = respondWith({ status: 'PENDING' })
    vi.stubGlobal('fetch', fetch)

    await fetchIntentOperationStatus({
      intentId: 1n,
      auth: { mode: 'apiKey', apiKey: 'rs_test' },
      endpointUrl: 'http://localhost:4000/orchestrator/',
    })

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:4000/orchestrator/intent-operation/1',
      expect.anything(),
    )
  })

  it.each([
    ['a 404 for an unknown id', respondWith({ errors: [{}] }, 404)],
    ['an unrecognized status value', respondWith({ status: 'BRAND_NEW' })],
    ['a shape without a status', respondWith({ data: [] })],
    [
      'a network failure',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      }),
    ],
  ])('is inconclusive (null) on %s', async (_case, fetch) => {
    // Callers treat null as "keep the blind grace poll" — every failure mode
    // must land there rather than throw, because a wrong "dead" verdict fails
    // a registration the chain could still confirm.
    vi.stubGlobal('fetch', fetch)

    await expect(
      fetchIntentOperationStatus({
        intentId: 1n,
        auth: { mode: 'apiKey', apiKey: 'rs_test' },
      }),
    ).resolves.toBeNull()
  })
})
