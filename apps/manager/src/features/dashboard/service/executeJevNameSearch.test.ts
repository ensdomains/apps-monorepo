import { describe, expect, it, vi } from 'vitest'
import {
  executeJevNameSearch,
  validateNameSearchInput,
} from './executeJevNameSearch'

const choice = (value: string, confidence = 0.95) => ({
  type: 'choice',
  choice: value,
  probabilities: { [value]: 1 },
  confidence,
})

const payload = (overrides: Record<string, unknown> = {}) => ({
  model: 'jev-1.13.0',
  answers: {
    fully_supported: { type: 'noul', noul: 0.95 },
    unsupported_requirement: { type: 'noul', noul: 0.05 },
    expiry: choice('expiring'),
    role: choice('any'),
    version: choice('any'),
    upgrade: choice('any'),
    favorite: choice('any'),
    primary: choice('any'),
    sort: choice('any'),
    ...overrides,
  },
  usage: { input_tokens: 321, output_tokens: 20 },
})

const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('executeJevNameSearch', () => {
  it('normalizes and validates input', () => {
    expect(
      validateNameSearchInput({ query: '  names expiring soon  ' }),
    ).toEqual({ query: 'names expiring soon' })
    expect(() => validateNameSearchInput({ query: ' ' })).toThrow(
      'Invalid search query length',
    )
    expect(() => validateNameSearchInput(null)).toThrow('Invalid search query')
  })

  it('uses the production request and preserves provider evidence', async () => {
    let sentUrl = ''
    let sentInit: RequestInit | undefined
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      sentUrl = url
      sentInit = init
      return jsonResponse(payload())
    })

    const result = await executeJevNameSearch({
      input: { query: ' names expiring within 45 days ' },
      apiKey: 'test-key',
      fetcher,
    })

    expect(result).toEqual({
      status: 'ok',
      filters: { expiry: 'expiring', withinDays: 45 },
      evidence: {
        requestedModel: 'jev-latest',
        questionSetVersion: 'v0',
        policyVersion: 'v1',
        returnedModel: 'jev-1.13.0',
        answers: payload().answers,
        usage: { inputTokens: 321, outputTokens: 20 },
      },
    })
    expect(sentUrl).toBe('https://api.typesafe.ai/v1/systemone')
    expect(sentInit?.method).toBe('POST')
    expect(new Headers(sentInit?.headers).get('Authorization')).toBe(
      'Bearer test-key',
    )
    const body = JSON.parse(String(sentInit?.body))
    expect(body.state).toBe('names expiring within 45 days')
    expect(body.model).toBe('jev-latest')
  })

  it('converts Chrono relative time into withinDays', async () => {
    const result = await executeJevNameSearch({
      input: { query: 'names expiring in two weeks' },
      apiKey: 'test-key',
      fetcher: async () => jsonResponse(payload()),
      now: new Date('2026-09-25T12:00:00.000Z'),
    })

    expect(result).toMatchObject({
      status: 'ok',
      filters: { expiry: 'expiring', withinDays: 14 },
    })
  })

  it('keeps semantic rejection distinct from provider failure', async () => {
    const rejected = await executeJevNameSearch({
      input: { query: 'names expiring soon' },
      apiKey: 'test-key',
      fetcher: async () =>
        jsonResponse(payload({ fully_supported: { type: 'noul', noul: 0.2 } })),
    })
    expect(rejected).toMatchObject({
      status: 'unsupported',
      reason: 'support_gate_rejected',
    })

    const unavailable = await executeJevNameSearch({
      input: { query: 'names expiring soon' },
      apiKey: 'test-key',
      fetcher: async () => jsonResponse({}, 503),
    })
    expect(unavailable).toMatchObject({
      status: 'unavailable',
      reason: 'http_error',
      httpStatus: 503,
    })
  })

  it('reports invalid JSON without exposing the API key', async () => {
    const result = await executeJevNameSearch({
      input: { query: 'names expiring soon' },
      apiKey: 'secret-that-must-not-appear',
      fetcher: async () => new Response('not json'),
    })

    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'invalid_json',
    })
    expect(JSON.stringify(result)).not.toContain('secret-that-must-not-appear')
  })
})
