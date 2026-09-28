import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildJevNameSearchRequest,
  parseJevNameSearchResponse,
} from '@/features/dashboard/service/jevNameSearch'
import { buildJevAiRequest, parseJevAiResponse } from './intent'
import { interpretJevRequest, type JevEnvironment } from './jevBoundary'

const address = '0x000000000000000000000000000000000000dead'
const token = 'synthetic-backend-token'
const key = 'synthetic-provider-secret'
const query = 'Show private-example.eth'

const modelResponse = {
  answers: {
    fully_supported: { type: 'noul', noul: 0.95 },
    unsupported_requirement: { type: 'noul', noul: 0.05 },
    multi_action: { type: 'noul', noul: 0.05 },
    intent: { type: 'choice', choice: 'view_name', confidence: 0.95 },
    next_intent: { type: 'choice', choice: 'none', confidence: 0.95 },
  },
}

const setup = () => {
  const limit = vi.fn(async () => ({ success: true }))
  const environment = {
    TYPESAFE_API_KEY: key,
    JEV_RATE_LIMIT: { limit },
  } as unknown as JevEnvironment
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async (input) =>
      String(input).endsWith('/auth/me')
        ? Response.json({ address })
        : Response.json(modelResponse),
    )
  return {
    limit,
    fetcher,
    options: {
      entryPoint: 'ai' as const,
      data: { query, authToken: token },
      requestUrl: 'https://app.ens.domains/ai',
      environment,
      fetcher,
      buildRequest: buildJevAiRequest,
      parseResponse: parseJevAiResponse,
      getIntent: (
        result: NonNullable<ReturnType<typeof parseJevAiResponse>>,
      ) => (result.status === 'ok' ? result.action.intent : undefined),
    },
  }
}

beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined))
afterEach(() => vi.restoreAllMocks())

describe('shared Jev interpretation orchestration', () => {
  it('authenticates, limits, redacts, and parses the real AI request in order', async () => {
    const { options, fetcher, limit } = setup()
    await expect(interpretJevRequest(options)).resolves.toEqual({
      status: 'ok',
      action: { intent: 'view_name', name: 'private-example.eth' },
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[0]?.[0]).toMatch(/\/auth\/me$/)
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({
      Authorization: `Bearer ${token}`,
    })
    const [providerUrl, request] = fetcher.mock.calls[1] ?? []
    expect(providerUrl).toBe('https://api.typesafe.ai/v1/systemone')
    expect(request?.headers).toEqual({
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    })
    expect(limit.mock.invocationCallOrder[0]).toBeGreaterThan(
      fetcher.mock.invocationCallOrder[0] ?? 0,
    )
    expect(limit.mock.invocationCallOrder[0]).toBeLessThan(
      fetcher.mock.invocationCallOrder[1] ?? 0,
    )
    const body = String(request?.body)
    for (const sensitive of [token, key, address, 'private-example.eth']) {
      expect(body).not.toContain(sensitive)
      expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(
        sensitive,
      )
    }
    expect(console.info).toHaveBeenCalledExactlyOnceWith('jev_interpret', {
      entryPoint: 'ai',
      status: 'ok',
      intent: 'view_name',
      latencyMs: expect.any(Number),
    })
  })

  it.each([
    '',
    'x',
    'x'.repeat(161),
  ])('rejects an invalid query without auth or provider calls: %j', async (invalidQuery) => {
    const { options, fetcher, limit } = setup()
    await expect(
      interpretJevRequest({
        ...options,
        data: { query: invalidQuery, authToken: token },
      }),
    ).resolves.toEqual({ status: 'unsupported' })
    expect(fetcher).not.toHaveBeenCalled()
    expect(limit).not.toHaveBeenCalled()
  })

  it('rejects a launcher-specific unsupported query before any network call', async () => {
    const { options, fetcher, limit } = setup()
    await expect(
      interpretJevRequest({ ...options, isSupportedQuery: () => false }),
    ).resolves.toEqual({ status: 'unsupported' })
    expect(fetcher).not.toHaveBeenCalled()
    expect(limit).not.toHaveBeenCalled()
  })

  it.each([
    401, 403,
  ])('never calls TypeSafe after auth status %s', async (status) => {
    const { options, fetcher, limit } = setup()
    fetcher.mockResolvedValueOnce(new Response(null, { status }))
    await expect(interpretJevRequest(options)).resolves.toEqual({
      status: 'unauthorized',
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(limit).not.toHaveBeenCalled()
  })

  it('never calls auth or TypeSafe when the signed backend token is missing', async () => {
    const { options, fetcher, limit } = setup()
    await expect(
      interpretJevRequest({ ...options, data: { query, authToken: '' } }),
    ).resolves.toEqual({ status: 'unauthorized' })
    expect(fetcher).not.toHaveBeenCalled()
    expect(limit).not.toHaveBeenCalled()
  })

  it('never calls TypeSafe when the verified address is rate limited', async () => {
    const { options, fetcher, limit } = setup()
    limit.mockResolvedValueOnce({ success: false })
    await expect(interpretJevRequest(options)).resolves.toEqual({
      status: 'rate_limited',
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(limit).toHaveBeenCalledExactlyOnceWith({ key: address })
  })

  it('shares the same address budget across both launchers', async () => {
    const { options, fetcher, limit } = setup()
    limit
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false })
    await expect(interpretJevRequest(options)).resolves.toMatchObject({
      status: 'ok',
    })
    await expect(
      interpretJevRequest({
        ...options,
        entryPoint: 'dashboard',
        data: {
          query: 'my manager names expiring soon',
          authToken: 'different-signed-token',
        },
        requestUrl: 'https://app.ens.domains/my/names',
        buildRequest: buildJevNameSearchRequest,
        parseResponse: (body, search) => {
          const filters = parseJevNameSearchResponse(body, search)
          return filters ? { status: 'ok' as const, filters } : null
        },
        getIntent: undefined,
      }),
    ).resolves.toEqual({ status: 'rate_limited' })
    expect(limit.mock.calls).toEqual([[{ key: address }], [{ key: address }]])
    expect(
      fetcher.mock.calls.filter(([url]) =>
        String(url).includes('api.typesafe.ai'),
      ),
    ).toHaveLength(1)
  })

  it('does not call TypeSafe without its secret or rate-limit binding', async () => {
    for (const environment of [
      { JEV_RATE_LIMIT: { limit: vi.fn(async () => ({ success: true })) } },
      { TYPESAFE_API_KEY: key },
    ]) {
      const { options, fetcher } = setup()
      await expect(
        interpretJevRequest({
          ...options,
          environment: environment as unknown as JevEnvironment,
        }),
      ).resolves.toEqual({ status: 'unavailable' })
      expect(fetcher).toHaveBeenCalledTimes(1)
    }
  })

  it.each([
    null,
    [],
    {},
    { answers: {} },
    { answers: { intent: { choice: 'view_name', confidence: 1 } } },
  ])('rejects malformed provider shape %j after the real parser validates it', async (body) => {
    const { options, fetcher } = setup()
    fetcher
      .mockResolvedValueOnce(Response.json({ address }))
      .mockResolvedValueOnce(Response.json(body))
    await expect(interpretJevRequest(options)).resolves.toEqual({
      status: 'unsupported',
    })
    expect(console.info).toHaveBeenLastCalledWith('jev_interpret', {
      entryPoint: 'ai',
      status: 'unsupported',
      latencyMs: expect.any(Number),
    })
  })

  it.each([
    429, 500, 503,
  ])('returns unavailable for provider status %s', async (status) => {
    const { options, fetcher } = setup()
    fetcher
      .mockResolvedValueOnce(Response.json({ address }))
      .mockResolvedValueOnce(new Response(null, { status }))
    await expect(interpretJevRequest(options)).resolves.toEqual({
      status: 'unavailable',
    })
  })

  it('returns unavailable for provider timeout without exposing its error text', async () => {
    const { options, fetcher } = setup()
    fetcher
      .mockResolvedValueOnce(Response.json({ address }))
      .mockRejectedValueOnce(new Error(`provider timeout ${key} ${query}`))
    await expect(interpretJevRequest(options)).resolves.toEqual({
      status: 'unavailable',
    })
    const logs = JSON.stringify(vi.mocked(console.info).mock.calls)
    expect(logs).not.toContain(query)
    expect(logs).not.toContain(key)
    expect(logs).not.toContain(token)
  })
})
