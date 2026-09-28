import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  callJev,
  isValidJevQuery,
  type JevEnvironment,
  logJevOutcome,
  validateJevInput,
  verifyJevAccess,
} from './jevBoundary'

const address = '0x000000000000000000000000000000000000dEaD'
const token = 'signed-backend-jwt'

const environment = (
  allowed = true,
): JevEnvironment & { JEV_RATE_LIMIT: RateLimit } =>
  ({
    TYPESAFE_API_KEY: 'local-secret',
    JEV_RATE_LIMIT: {
      limit: vi.fn(async () => ({ success: allowed })),
    },
  }) as unknown as JevEnvironment & { JEV_RATE_LIMIT: RateLimit }

afterEach(() => vi.restoreAllMocks())

describe('shared Jev access', () => {
  it('accepts only bounded string queries and string auth tokens', () => {
    expect(validateJevInput(null)).toEqual({ query: '', authToken: '' })
    expect(validateJevInput({ query: 42, authToken: {} })).toEqual({
      query: '',
      authToken: '',
    })
    expect(
      validateJevInput({ query: '  names expiring soon  ', authToken: token }),
    ).toEqual({ query: 'names expiring soon', authToken: token })
    expect(isValidJevQuery('')).toBe(false)
    expect(isValidJevQuery('a')).toBe(false)
    expect(isValidJevQuery('ab')).toBe(true)
    expect(isValidJevQuery('a'.repeat(160))).toBe(true)
    expect(isValidJevQuery('a'.repeat(161))).toBe(false)
  })

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

  it('fails closed when TypeSafe returns an error or malformed JSON', async () => {
    const unavailable = vi.fn(
      async () => new Response('Unavailable', { status: 503 }),
    ) as unknown as typeof fetch
    expect(await callJev({}, environment(), unavailable)).toEqual({
      status: 'unavailable',
    })

    const malformed = vi.fn(
      async () => new Response('{not-json', { status: 200 }),
    ) as unknown as typeof fetch
    expect(await callJev({}, environment(), malformed)).toEqual({
      status: 'unavailable',
    })
  })

  it('fails closed when the TypeSafe request times out or throws', async () => {
    const timedOut = vi.fn(async () => {
      throw new DOMException('The request was aborted', 'AbortError')
    }) as unknown as typeof fetch
    expect(await callJev({}, environment(), timedOut)).toEqual({
      status: 'unavailable',
    })
  })

  it.each([
    401, 403,
  ])('rejects backend status %s before using the limiter', async (status) => {
    const env = environment()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status }))
    await expect(
      verifyJevAccess({
        authToken: token,
        requestUrl: 'https://app.ens.domains/ai',
        environment: env,
        fetcher,
      }),
    ).resolves.toEqual({ status: 'unauthorized' })
    expect(env.JEV_RATE_LIMIT?.limit).not.toHaveBeenCalled()
  })

  it.each([
    null,
    [],
    {},
    { address: 'alice.eth' },
    { address: '0x1234' },
    { address: 12 },
  ])('rejects a malformed auth identity %j', async (body) => {
    const env = environment()
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body))
    await expect(
      verifyJevAccess({
        authToken: token,
        requestUrl: 'https://app.ens.domains/ai',
        environment: env,
        fetcher,
      }),
    ).resolves.toEqual({ status: 'unavailable' })
    expect(env.JEV_RATE_LIMIT?.limit).not.toHaveBeenCalled()
  })

  it('does not fetch auth for a token exceeding the bound', async () => {
    const fetcher = vi.fn<typeof fetch>()
    await expect(
      verifyJevAccess({
        authToken: 'x'.repeat(4097),
        requestUrl: 'https://app.ens.domains/ai',
        environment: environment(),
        fetcher,
      }),
    ).resolves.toEqual({ status: 'unauthorized' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([302, 500])('fails closed on auth status %s', async (status) => {
    const env = environment()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status }))
    await expect(
      verifyJevAccess({
        authToken: token,
        requestUrl: 'https://app.ens.domains/ai',
        environment: env,
        fetcher,
      }),
    ).resolves.toEqual({ status: 'unavailable' })
    expect(env.JEV_RATE_LIMIT?.limit).not.toHaveBeenCalled()
  })

  it('fails closed on malformed auth JSON, auth timeout, and limiter failure', async () => {
    const env = environment()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('not json'))
      .mockRejectedValueOnce(new DOMException('Timed out', 'TimeoutError'))
      .mockResolvedValueOnce(Response.json({ address }))
    const request = {
      authToken: token,
      requestUrl: 'https://app.ens.domains/ai',
      environment: env,
      fetcher,
    }
    await expect(verifyJevAccess(request)).resolves.toEqual({
      status: 'unavailable',
    })
    await expect(verifyJevAccess(request)).resolves.toEqual({
      status: 'unavailable',
    })
    vi.mocked(env.JEV_RATE_LIMIT.limit).mockRejectedValueOnce(
      new Error('binding unavailable'),
    )
    await expect(verifyJevAccess(request)).resolves.toEqual({
      status: 'unavailable',
    })
  })

  it('uses one verified-address rate-limit key for the AI and dashboard entry points', async () => {
    const env = environment()
    const limit = vi.mocked(env.JEV_RATE_LIMIT.limit)
    limit
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false })
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ address }))
      .mockResolvedValueOnce(Response.json({ address: address.toLowerCase() }))
    const base = { authToken: token, environment: env, fetcher }
    await expect(
      verifyJevAccess({ ...base, requestUrl: 'https://app.ens.domains/ai' }),
    ).resolves.toEqual({ status: 'ok', address: address.toLowerCase() })
    await expect(
      verifyJevAccess({
        ...base,
        requestUrl: 'https://app.ens.domains/my/names',
      }),
    ).resolves.toEqual({ status: 'rate_limited' })
    expect(limit.mock.calls).toEqual([
      [{ key: address.toLowerCase() }],
      [{ key: address.toLowerCase() }],
    ])
  })

  it('does not contact TypeSafe with an absent or whitespace secret', async () => {
    const fetcher = vi.fn<typeof fetch>()
    for (const key of [undefined, '', '   ']) {
      await expect(
        callJev({}, { ...environment(), TYPESAFE_API_KEY: key }, fetcher),
      ).resolves.toEqual({ status: 'unavailable' })
    }
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('sets separate bounded timeouts for auth and TypeSafe', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json({ address }))
    await verifyJevAccess({
      authToken: token,
      requestUrl: 'https://app.ens.domains/ai',
      environment: environment(),
      fetcher,
    })
    await callJev({ state: 'show [ENS_NAME]' }, environment(), fetcher)
    expect(timeout.mock.calls).toEqual([[5000], [8000]])
  })

  it('logs only the outcome, bounded intent, entry point, and elapsed time', () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.spyOn(Date, 'now').mockReturnValue(1200)
    logJevOutcome('ai', 'ok', 1000, 'renew')
    logJevOutcome('dashboard', 'unauthorized', 1100)
    expect(log.mock.calls).toEqual([
      [
        'jev_interpret',
        { entryPoint: 'ai', status: 'ok', intent: 'renew', latencyMs: 200 },
      ],
      [
        'jev_interpret',
        { entryPoint: 'dashboard', status: 'unauthorized', latencyMs: 100 },
      ],
    ])
    expect(JSON.stringify(log.mock.calls)).not.toContain(token)
    expect(JSON.stringify(log.mock.calls)).not.toContain('local-secret')
    expect(JSON.stringify(log.mock.calls)).not.toContain(address)
  })
})
