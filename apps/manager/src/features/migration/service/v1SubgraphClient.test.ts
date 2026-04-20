import { assert, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getV1NamesForAddress,
  getV1ProfileKeys,
  type V1Domain,
} from './v1SubgraphClient'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const makeDomain = (id: string): V1Domain =>
  ({
    id,
    labelName: 'alice',
    labelhash: `0x${id}`,
    name: `${id}.eth`,
    isMigrated: false,
    createdAt: '0',
    resolvedAddress: null,
    resolver: null,
    owner: { id: '0x0000000000000000000000000000000000000001' },
    registrant: { id: '0x0000000000000000000000000000000000000001' },
    wrappedOwner: null,
    parent: null,
    registration: null,
    wrappedDomain: null,
  }) as V1Domain

const jsonResponse = <T>(body: T, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    // biome-ignore lint/suspicious/noExplicitAny: partial Response shape
  }) as any

beforeEach(() => {
  fetchMock.mockReset()
})

describe('getV1NamesForAddress', () => {
  it('returns ok with a single page when less than PAGE_SIZE domains are returned', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { domains: [makeDomain('0x01')] } }),
    )

    const result = await getV1NamesForAddress(
      '0x0000000000000000000000000000000000000001',
    )
    assert(result.isOk())
    expect(result.value).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('paginates until a page returns fewer than PAGE_SIZE domains', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, i) =>
      makeDomain(`0xpage1-${i}`),
    )
    const secondPage = [makeDomain('0xpage2-0')]
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: { domains: firstPage } }))
      .mockResolvedValueOnce(jsonResponse({ data: { domains: secondPage } }))

    const result = await getV1NamesForAddress(
      '0x0000000000000000000000000000000000000001',
    )
    assert(result.isOk())
    expect(result.value).toHaveLength(1001)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('stops paginating on exactly PAGE_SIZE boundary once a partial page arrives', async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) =>
      makeDomain(`0x${i}`),
    )
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: { domains: fullPage } }))
      .mockResolvedValueOnce(jsonResponse({ data: { domains: [] } }))

    const result = await getV1NamesForAddress(
      '0x0000000000000000000000000000000000000001',
    )
    assert(result.isOk())
    expect(result.value).toHaveLength(1000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('lowercases the address in the query variables', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { domains: [] } }))

    await getV1NamesForAddress('0xABCDEF0123456789ABCDEF0123456789ABCDEF01')

    const [, init] = fetchMock.mock.calls[0]! as [string, { body: string }]
    const body = JSON.parse(init.body)
    expect(body.variables.whereFilter.and[0].or[0].owner).toBe(
      '0xabcdef0123456789abcdef0123456789abcdef01',
    )
  })

  it('returns err when the HTTP response is not ok', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 502))

    const result = await getV1NamesForAddress(
      '0x0000000000000000000000000000000000000001',
    )
    assert(result.isErr())
    expect(result.error._tag).toBe('GetV1NamesError')
  })

  it('returns err when the GraphQL response contains an errors array', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: { domains: [] },
        errors: [{ message: 'subgraph boom' }],
      }),
    )

    const result = await getV1NamesForAddress(
      '0x0000000000000000000000000000000000000001',
    )
    assert(result.isErr())
    expect(result.error._tag).toBe('GetV1NamesError')
  })
})

describe('getV1ProfileKeys', () => {
  it('returns ok with an empty array without issuing an HTTP request when domainIds is empty', async () => {
    const result = await getV1ProfileKeys([])
    assert(result.isOk())
    expect(result.value).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps subgraph rows to V1ProfileKeys, defaulting missing resolver fields to empty arrays', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          domains: [
            {
              id: '0x01',
              resolver: { texts: ['email'], coinTypes: [60] },
            },
            {
              id: '0x02',
              resolver: null,
            },
            {
              id: '0x03',
              resolver: { texts: null, coinTypes: null },
            },
          ],
        },
      }),
    )

    const result = await getV1ProfileKeys(['0x01', '0x02', '0x03'])
    assert(result.isOk())
    expect(result.value).toEqual([
      { id: '0x01', texts: ['email'], coinTypes: [60] },
      { id: '0x02', texts: [], coinTypes: [] },
      { id: '0x03', texts: [], coinTypes: [] },
    ])
  })

  it('lowercases each id when building the id_in filter', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { domains: [] } }))

    await getV1ProfileKeys(['0xABCD', '0xef01'])

    const [, init] = fetchMock.mock.calls[0]! as [string, { body: string }]
    const body = JSON.parse(init.body)
    expect(body.variables.whereFilter.id_in).toEqual(['0xabcd', '0xef01'])
  })

  it('returns err on non-ok HTTP response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500))

    const result = await getV1ProfileKeys(['0x01'])
    assert(result.isErr())
    expect(result.error._tag).toBe('GetV1ProfilesError')
  })

  it('returns err when GraphQL returns errors', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: { domains: [] },
        errors: [{ message: 'bad query' }],
      }),
    )

    const result = await getV1ProfileKeys(['0x01'])
    assert(result.isErr())
    expect(result.error._tag).toBe('GetV1ProfilesError')
  })

  it('chunks large id_in arrays into batches of 500 and merges results', async () => {
    const ids = Array.from({ length: 501 }, (_, i) => `0x${i.toString(16)}`)
    const firstChunk = Array.from({ length: 500 }, (_, i) => ({
      id: `0x${i.toString(16)}`,
      resolver: { texts: [], coinTypes: [] },
    }))
    const secondChunk = [
      {
        id: '0x1f4',
        resolver: { texts: ['email'], coinTypes: [] },
      },
    ]
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: { domains: firstChunk } }))
      .mockResolvedValueOnce(jsonResponse({ data: { domains: secondChunk } }))

    const result = await getV1ProfileKeys(ids)
    assert(result.isOk())
    expect(result.value).toHaveLength(501)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const body0 = JSON.parse(
      (fetchMock.mock.calls[0]![1] as { body: string }).body,
    )
    const body1 = JSON.parse(
      (fetchMock.mock.calls[1]![1] as { body: string }).body,
    )
    expect(body0.variables.whereFilter.id_in).toHaveLength(500)
    expect(body1.variables.whereFilter.id_in).toHaveLength(1)
  })
})
