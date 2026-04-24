import indexerClient from '@ens-apps/indexer/urql'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockIndexerQuery } from './_fixtures'
import { getRegisteredV2Names } from './getRegisteredV2Names'

vi.mock('@ens-apps/indexer/urql', () => ({ default: { query: vi.fn() } }))

const queryMock = vi.mocked(indexerClient.query)
const respond = (r: { data?: unknown; error?: unknown }) =>
  mockIndexerQuery(queryMock, r)

const nameIn = (callIndex = 0) =>
  (queryMock.mock.calls[callIndex]![1] as { where: { name_in: string[] } })
    .where.name_in

beforeEach(() => {
  queryMock.mockReset()
})

describe('getRegisteredV2Names', () => {
  it('returns an empty set without querying the indexer when names is empty', async () => {
    expect((await getRegisteredV2Names([])).size).toBe(0)
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('returns the set of names returned by the indexer', async () => {
    respond({
      data: { domains: [{ name: 'alice.eth' }, { name: 'bob.eth' }] },
    })
    expect(
      await getRegisteredV2Names(['alice.eth', 'bob.eth', 'charlie.eth']),
    ).toEqual(new Set(['alice.eth', 'bob.eth']))
  })

  it('lowercases the name_in filter and the returned set', async () => {
    respond({ data: { domains: [{ name: 'ALICE.ETH' }] } })
    expect(await getRegisteredV2Names(['ALICE.ETH'])).toEqual(
      new Set(['alice.eth']),
    )
    expect(nameIn()).toEqual(['alice.eth'])
  })

  it('chunks names into batches of 1000 and merges results', async () => {
    const names = Array.from({ length: 1001 }, (_, i) => `n${i}.eth`)
    respond({
      data: {
        domains: Array.from({ length: 1000 }, (_, i) => ({
          name: `n${i}.eth`,
        })),
      },
    })
    respond({ data: { domains: [{ name: 'n1000.eth' }] } })

    const result = await getRegisteredV2Names(names)
    expect(result.size).toBe(1001)
    expect(queryMock).toHaveBeenCalledTimes(2)
    expect(nameIn(0)).toHaveLength(1000)
    expect(nameIn(1)).toHaveLength(1)
  })

  it.each([
    [
      'indexer error',
      { error: new Error('indexer 500') },
      /indexer 500/,
    ] as const,
    ['no data and no error', {}, /Indexer query returned no data/] as const,
  ])('throws on %s', async (_, response, match) => {
    respond(response)
    await expect(getRegisteredV2Names(['alice.eth'])).rejects.toThrow(match)
  })
})
