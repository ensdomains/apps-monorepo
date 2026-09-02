import { CombinedError, stringifyDocument } from '@urql/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }))

// Only the request helper is stubbed: `createPlainClient` still builds a real
// client (never used, since the request never reaches it) and `CombinedError`
// stays the real class, so the `instanceof` check in the retry classifier
// exercises the production path.
vi.mock('@ens-apps/indexer/urql/request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ens-apps/indexer/urql/request')>()),
  graphqlRequest: mockRequest,
}))

import { fetchExpiringNamesPage, QUERY_PAGE_SIZE } from './indexer.js'
import { getStage } from './test-helpers.js'

describe('fetchExpiringNamesPage', () => {
  beforeEach(() => {
    mockRequest.mockReset()
    vi.useFakeTimers()
  })

  it('sends expected query variables and maps response', async () => {
    mockRequest.mockResolvedValue({
      domains: [
        {
          name: 'alpha.eth',
          expiryDate: 1700000000,
          owner: { id: '0xABC' },
        },
      ],
    })

    const result = await fetchExpiringNamesPage({
      env: {
        ENS_INDEXER_GRAPHQL_URL: 'https://staging-graphql.ens.dev/',
      } as CloudflareBindings,
      stage: getStage('expiry-30d'),
      cursor: 100,
      upperBound: 200,
    })

    expect(result.isOk()).toBe(true)
    expect(mockRequest).toHaveBeenCalledTimes(1)

    const [, document, variables] = mockRequest.mock.calls[0]
    expect(stringifyDocument(document)).toContain(`first: ${QUERY_PAGE_SIZE}`)
    expect(variables).toEqual({
      cursor: 100,
      upper_bound: 200,
    })

    expect(result._unsafeUnwrap()).toEqual({
      domains: [{ name: 'alpha.eth', expiryDate: 1700000000, owner: '0xabc' }],
      hasMore: false,
    })
  })

  it('retries transient errors and succeeds', async () => {
    mockRequest
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ domains: [] })

    const promise = fetchExpiringNamesPage({
      env: {
        ENS_INDEXER_GRAPHQL_URL: 'https://staging-graphql.ens.dev/',
      } as CloudflareBindings,
      stage: getStage('expiry-7d'),
      cursor: 1,
      upperBound: 2,
    })

    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.isOk()).toBe(true)
    expect(mockRequest).toHaveBeenCalledTimes(2)
  })

  it('does not retry non-retryable client errors', async () => {
    const nonRetryableError = new CombinedError({
      networkError: new Error('Bad Request'),
      response: { status: 400, headers: new Headers() },
    })

    mockRequest.mockRejectedValue(nonRetryableError)

    const result = await fetchExpiringNamesPage({
      env: {
        ENS_INDEXER_GRAPHQL_URL: 'https://staging-graphql.ens.dev/',
      } as CloudflareBindings,
      stage: getStage('expiry-1d'),
      cursor: 1,
      upperBound: 2,
    })

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()._tag).toBe('INDEXER_REQUEST_ERROR')
    expect(mockRequest).toHaveBeenCalledTimes(1)
  })

  it('fails on invalid expiryDate values', async () => {
    mockRequest.mockResolvedValue({
      domains: [
        {
          name: 'bad.eth',
          expiryDate: 'not-a-number',
          owner: null,
        },
      ],
    })

    const result = await fetchExpiringNamesPage({
      env: {
        ENS_INDEXER_GRAPHQL_URL: 'https://staging-graphql.ens.dev/',
      } as CloudflareBindings,
      stage: getStage('expiry-30d'),
      cursor: 1,
      upperBound: 2,
    })

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()._tag).toBe('INDEXER_VALIDATION_ERROR')
  })

  it('marks hasMore=true for a full lookahead page', async () => {
    mockRequest.mockResolvedValue({
      domains: Array.from({ length: QUERY_PAGE_SIZE }, (_, i) => ({
        name: `${i}.eth`,
        expiryDate: 1_700_000_000 + i,
        owner: null,
      })),
    })

    const result = await fetchExpiringNamesPage({
      env: {
        ENS_INDEXER_GRAPHQL_URL: 'https://staging-graphql.ens.dev/',
      } as CloudflareBindings,
      stage: getStage('expiry-30d'),
      cursor: 1,
      upperBound: 2,
    })

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap().hasMore).toBe(true)
    expect(result._unsafeUnwrap().domains).toHaveLength(QUERY_PAGE_SIZE)
  })

  it('marks hasMore=false for a full processable page without lookahead', async () => {
    mockRequest.mockResolvedValue({
      domains: Array.from({ length: QUERY_PAGE_SIZE - 1 }, (_, i) => ({
        name: `${i}.eth`,
        expiryDate: 1_700_000_000 + i,
        owner: null,
      })),
    })

    const result = await fetchExpiringNamesPage({
      env: {
        ENS_INDEXER_GRAPHQL_URL: 'https://staging-graphql.ens.dev/',
      } as CloudflareBindings,
      stage: getStage('expiry-30d'),
      cursor: 1,
      upperBound: 2,
    })

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap().hasMore).toBe(false)
  })
})
