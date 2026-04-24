import indexerClient from '@ens-apps/indexer/urql'
import { assert, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMigratedNamesCount } from './getMigratedNamesCount'

vi.mock('@ens-apps/indexer/urql', () => ({
  default: { query: vi.fn() },
}))

const queryMock = vi.mocked(indexerClient.query)

const mockQueryResponse = (response: {
  data?: unknown
  error?: unknown
}): void => {
  queryMock.mockReturnValueOnce({
    toPromise: () => Promise.resolve(response),
    // biome-ignore lint/suspicious/noExplicitAny: partial mock of urql OperationResult
  } as any)
}

beforeEach(() => {
  queryMock.mockReset()
})

describe('getMigratedNamesCount', () => {
  it('returns ok with the total count from the indexer', async () => {
    mockQueryResponse({
      data: { domainConnection: { totalCount: 42 } },
    })

    const result = await getMigratedNamesCount(
      '0x0000000000000000000000000000000000000001',
    )
    assert(result.isOk())
    expect(result.value).toBe(42)
  })

  it('returns ok with 0 when totalCount is missing', async () => {
    mockQueryResponse({ data: { domainConnection: {} } })

    const result = await getMigratedNamesCount(
      '0x0000000000000000000000000000000000000001',
    )
    assert(result.isOk())
    expect(result.value).toBe(0)
  })

  it('returns err when the indexer query reports an error', async () => {
    mockQueryResponse({ error: new Error('indexer 500') })

    const result = await getMigratedNamesCount(
      '0x0000000000000000000000000000000000000001',
    )
    assert(result.isErr())
    expect(result.error._tag).toBe('GetMigratedNamesCountError')
  })

  it('returns err when the indexer query has no data and no error', async () => {
    mockQueryResponse({})

    const result = await getMigratedNamesCount(
      '0x0000000000000000000000000000000000000001',
    )
    assert(result.isErr())
    expect(result.error._tag).toBe('GetMigratedNamesCountError')
  })

  it('lowercases the address when building query variables', async () => {
    mockQueryResponse({
      data: { domainConnection: { totalCount: 1 } },
    })

    await getMigratedNamesCount('0xABCDEF0123456789ABCDEF0123456789ABCDEF01')

    const variables = queryMock.mock.calls[0]?.[1] as
      | { where?: { owner?: string } }
      | undefined
    expect(variables?.where?.owner).toBe(
      '0xabcdef0123456789abcdef0123456789abcdef01',
    )
  })
})
