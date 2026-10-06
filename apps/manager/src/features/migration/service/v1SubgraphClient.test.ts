import { assert, beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonResponse } from './_fixtures'
import { getV1ProfileKeys } from './v1SubgraphClient'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const readBody = (callIndex = 0) =>
  JSON.parse((fetchMock.mock.calls[callIndex]?.[1] as { body: string }).body)

beforeEach(() => {
  fetchMock.mockReset()
})

describe('getV1ProfileKeys', () => {
  it('returns ok with empty array without HTTP when domainIds is empty', async () => {
    const result = await getV1ProfileKeys([])
    assert(result.isOk())
    expect(result.value).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps rows to V1ProfileKeys, defaulting missing resolver fields to empty arrays', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          domains: [
            {
              id: '0x01',
              resolver: {
                texts: ['email'],
                coinTypes: [60],
                contentHash: '0xe301',
                abiChangeds: [
                  { contentType: '1' },
                  { contentType: '1' },
                  { contentType: '2' },
                ],
              },
            },
            { id: '0x02', resolver: null },
            { id: '0x03', resolver: { texts: null, coinTypes: null } },
          ],
        },
      }),
    )
    const result = await getV1ProfileKeys(['0x01', '0x02', '0x03'])
    assert(result.isOk())
    expect(result.value).toEqual([
      {
        id: '0x01',
        texts: ['email'],
        coinTypes: [60],
        contentHash: '0xe301',
        abiContentTypes: [1n, 2n],
      },
      {
        id: '0x02',
        texts: [],
        coinTypes: [],
        contentHash: null,
        abiContentTypes: [],
      },
      {
        id: '0x03',
        texts: [],
        coinTypes: [],
        contentHash: null,
        abiContentTypes: [],
      },
    ])
  })

  it('lowercases each id when building the id_in filter', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { domains: [] } }))
    await getV1ProfileKeys(['0xABCD', '0xef01'])
    expect(readBody().variables.whereFilter.id_in).toEqual(['0xabcd', '0xef01'])
  })

  it.each([
    [
      'non-ok HTTP',
      () => fetchMock.mockResolvedValueOnce(jsonResponse({}, 500)),
    ],
    [
      'GraphQL errors',
      () =>
        fetchMock.mockResolvedValueOnce(
          jsonResponse({
            data: { domains: [] },
            errors: [{ message: 'bad query' }],
          }),
        ),
    ],
  ])('returns err on %s', async (_, setup) => {
    setup()
    const result = await getV1ProfileKeys(['0x01'])
    assert(result.isErr())
    expect(result.error._tag).toBe('GetV1ProfilesError')
  })

  it('chunks large id_in arrays into batches of 500 and merges results', async () => {
    const ids = Array.from({ length: 501 }, (_, i) => `0x${i.toString(16)}`)
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            domains: Array.from({ length: 500 }, (_, i) => ({
              id: `0x${i.toString(16)}`,
              resolver: { texts: [], coinTypes: [] },
            })),
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            domains: [
              { id: '0x1f4', resolver: { texts: ['email'], coinTypes: [] } },
            ],
          },
        }),
      )

    const result = await getV1ProfileKeys(ids)
    assert(result.isOk())
    expect(result.value).toHaveLength(501)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(readBody(0).variables.whereFilter.id_in).toHaveLength(500)
    expect(readBody(1).variables.whereFilter.id_in).toHaveLength(1)
  })
})
