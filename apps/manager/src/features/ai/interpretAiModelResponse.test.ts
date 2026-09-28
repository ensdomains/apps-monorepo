import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildJevAiRequest } from './intent'
import { interpretAiModelResponse } from './interpretAiModelResponse'
import { interpretJevRequest, type JevEnvironment } from './jevBoundary'

const choice = (choice: string, confidence = 0.99) => ({
  type: 'choice',
  choice,
  confidence,
})
const query = 'pin githb on private-example.eth'
const initial = (confidence = 0.5) => ({
  answers: {
    intent: choice('edit_profile', confidence),
    next_intent: choice('none'),
    fully_supported: { type: 'noul', noul: 0.99 },
    unsupported_requirement: { type: 'noul', noul: 0.01 },
    multi_action: { type: 'noul', noul: 0.01 },
    request_mode: choice('requested'),
    action_count: choice('one'),
    profile_field: choice('github', 0.88),
    profile_operation: choice('feature', 0.63),
  },
})
const verified = {
  answers: {
    operation: { type: 'noul', noul: 0.99 },
    details: { type: 'noul', noul: 0.99 },
    coverage: { type: 'noul', noul: 0.99 },
  },
}
const action = {
  intent: 'edit_profile',
  name: 'private-example.eth',
  field: 'github',
  section: 'contact',
  operation: 'feature',
}

beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined))
afterEach(() => vi.restoreAllMocks())

describe('conditional interpretation verification', () => {
  it('does not spend a follow-up call on a normal accepted interpretation', async () => {
    const verify = vi.fn()
    await expect(
      interpretAiModelResponse(initial(0.99), query, verify),
    ).resolves.toEqual({ status: 'ok', action })
    expect(verify).not.toHaveBeenCalled()
  })

  it('verifies a bounded uncertain candidate once before returning it', async () => {
    const verify = vi.fn(async () => ({
      status: 'ok' as const,
      body: verified,
    }))
    await expect(
      interpretAiModelResponse(initial(), query, verify),
    ).resolves.toEqual({ status: 'ok', action })
    expect(verify).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(verify.mock.calls)).not.toContain(
      'private-example.eth',
    )
  })

  it('returns a confirmation request for an uncertain operation with preserved details', async () => {
    const body = {
      answers: { ...verified.answers, operation: { type: 'noul', noul: 0.6 } },
    }
    await expect(
      interpretAiModelResponse(initial(), query, async () => ({
        status: 'ok',
        body,
      })),
    ).resolves.toEqual({ status: 'needs_confirmation', action })
  })

  it.each([
    'details',
    'coverage',
  ])('rejects an uncertain %s instead of offering part of the request', async (field) => {
    const body = {
      answers: { ...verified.answers, [field]: { type: 'noul', noul: 0.6 } },
    }
    await expect(
      interpretAiModelResponse(initial(), query, async () => ({
        status: 'ok',
        body,
      })),
    ).resolves.toEqual({ status: 'unsupported' })
  })

  it('preserves an unavailable follow-up outcome', async () => {
    await expect(
      interpretAiModelResponse(initial(), query, async () => ({
        status: 'unavailable',
      })),
    ).resolves.toEqual({ status: 'unavailable' })
  })

  it.each([
    'Do not pin githb on private-example.eth',
    'pin githb on private-example.eth and transfer it',
  ])('cannot verify past a deterministic prohibition: %s', async (query) => {
    const verify = vi.fn()
    await expect(
      interpretAiModelResponse(initial(), query, verify),
    ).resolves.toEqual({ status: 'unsupported' })
    expect(verify).not.toHaveBeenCalled()
  })
})

const address = '0x000000000000000000000000000000000000dead'
const setup = () => {
  const limit = vi.fn(async () => ({ success: true }))
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ address }))
    .mockResolvedValueOnce(Response.json(initial()))
    .mockResolvedValueOnce(Response.json(verified))
  return {
    limit,
    fetcher,
    options: {
      entryPoint: 'ai' as const,
      data: { query, authToken: 'synthetic-backend-token' },
      requestUrl: 'https://app.ens.domains/ai',
      environment: {
        TYPESAFE_API_KEY: 'synthetic-provider-secret',
        JEV_RATE_LIMIT: { limit },
      } as unknown as JevEnvironment,
      buildRequest: buildJevAiRequest,
      parseResponse: interpretAiModelResponse,
      fetcher,
    },
  }
}

describe('authenticated candidate verification boundary', () => {
  it('authenticates and charges one prompt budget before either provider call', async () => {
    const { options, fetcher, limit } = setup()
    await expect(interpretJevRequest(options)).resolves.toEqual({
      status: 'ok',
      action,
    })
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(limit).toHaveBeenCalledExactlyOnceWith({ key: address })
    expect(fetcher.mock.calls[0]?.[0]).toMatch(/\/auth\/me$/)
    for (const [, init] of fetcher.mock.calls.slice(1)) {
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer synthetic-provider-secret',
      })
      for (const secret of [
        'synthetic-backend-token',
        address,
        'private-example.eth',
        'synthetic-provider-secret',
      ])
        expect(String(init?.body)).not.toContain(secret)
    }
    const logs = JSON.stringify(vi.mocked(console.info).mock.calls)
    expect(logs).not.toMatch(
      /private-example|synthetic-backend|synthetic-provider|000000dead/,
    )
  })

  it('does not make either provider call after rate limiting', async () => {
    const { options, fetcher, limit } = setup()
    limit.mockResolvedValueOnce({ success: false })
    await expect(interpretJevRequest(options)).resolves.toEqual({
      status: 'rate_limited',
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('does not make either provider call for expired auth', async () => {
    const { options, fetcher } = setup()
    fetcher
      .mockReset()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
    await expect(interpretJevRequest(options)).resolves.toEqual({
      status: 'unauthorized',
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('enforces at most one provider follow-up inside the boundary', async () => {
    const { options, fetcher } = setup()
    await expect(
      interpretJevRequest({
        ...options,
        parseResponse: async (_body, _query, followup) => {
          await followup({ first: true })
          return followup({ second: true })
        },
      }),
    ).resolves.toEqual({ status: 'unavailable' })
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('returns unavailable after a second-call timeout without falling back to the candidate', async () => {
    const { options, fetcher } = setup()
    fetcher
      .mockReset()
      .mockResolvedValueOnce(Response.json({ address }))
      .mockResolvedValueOnce(Response.json(initial()))
      .mockRejectedValueOnce(new Error('timeout with private-example.eth'))
    await expect(interpretJevRequest(options)).resolves.toEqual({
      status: 'unavailable',
    })
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(
      'private-example.eth',
    )
  })
})
