import { describe, expect, it, vi } from 'vitest'
import { callJev, type JevEnvironment, verifyJevAccess } from './jevBoundary'

const address = '0x000000000000000000000000000000000000dEaD'
const token = 'signed-backend-jwt'

const environment = (allowed = true): JevEnvironment =>
  ({
    TYPESAFE_API_KEY: 'local-secret',
    JEV_RATE_LIMIT: {
      limit: vi.fn(async () => ({ success: allowed })),
    },
  }) as unknown as JevEnvironment

describe('shared Jev access', () => {
  it('verifies a signed token through /auth/me before using the address limiter', async () => {
    const env = environment()
    const fetcher = vi.fn(async () =>
      Response.json({ address }),
    ) as unknown as typeof fetch
    expect(
      await verifyJevAccess({
        authToken: token,
        requestUrl: 'https://app.ens.domains/ai',
        environment: env,
        fetcher,
      }),
    ).toEqual({ status: 'ok', address: address.toLowerCase() })
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringMatching(/\/auth\/me$/),
      expect.objectContaining({
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'manual',
      }),
    )
    expect(env.JEV_RATE_LIMIT?.limit).toHaveBeenCalledWith({
      key: address.toLowerCase(),
    })
  })

  it('rejects missing and expired tokens without a TypeSafe call', async () => {
    const env = environment()
    const fetcher = vi.fn(
      async () => new Response(null, { status: 401 }),
    ) as unknown as typeof fetch
    expect(
      await verifyJevAccess({
        authToken: '',
        requestUrl: 'https://app.ens.domains/ai',
        environment: env,
        fetcher,
      }),
    ).toEqual({ status: 'unauthorized' })
    expect(fetcher).not.toHaveBeenCalled()
    expect(
      await verifyJevAccess({
        authToken: token,
        requestUrl: 'https://app.ens.domains/ai',
        environment: env,
        fetcher,
      }),
    ).toEqual({ status: 'unauthorized' })
    expect(env.JEV_RATE_LIMIT?.limit).not.toHaveBeenCalled()
  })

  it('shares the address limit and fails closed without a binding or key', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ address }),
    ) as unknown as typeof fetch
    expect(
      await verifyJevAccess({
        authToken: token,
        requestUrl: 'https://app.ens.domains/ai',
        environment: environment(false),
        fetcher,
      }),
    ).toEqual({ status: 'rate_limited' })
    expect(
      await verifyJevAccess({
        authToken: token,
        requestUrl: 'https://app.ens.domains/ai',
        environment: {} as JevEnvironment,
        fetcher,
      }),
    ).toEqual({ status: 'unavailable' })
    expect(await callJev({}, {} as JevEnvironment, fetcher)).toEqual({
      status: 'unavailable',
    })
  })

  it('does not forward the backend token across redirects', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: 'https://another.example/auth/me' },
        }),
    ) as unknown as typeof fetch
    expect(
      await verifyJevAccess({
        authToken: token,
        requestUrl: 'https://app.ens.domains/ai',
        environment: environment(),
        fetcher,
      }),
    ).toEqual({ status: 'unavailable' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('sends only a bounded request and the TypeSafe key to TypeSafe', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ answers: {} }),
    ) as unknown as typeof fetch
    expect(
      await callJev(
        { model: 'jev-latest', state: 'register [ENS_NAME]' },
        environment(),
        fetcher,
      ),
    ).toEqual({ status: 'ok', body: { answers: {} } })
    const [, init] = vi.mocked(fetcher).mock.calls[0] ?? []
    expect(init?.body).toBe(
      JSON.stringify({ model: 'jev-latest', state: 'register [ENS_NAME]' }),
    )
    expect(String(init?.body)).not.toContain(token)
    expect(String(init?.body)).not.toContain(address)
  })
})
