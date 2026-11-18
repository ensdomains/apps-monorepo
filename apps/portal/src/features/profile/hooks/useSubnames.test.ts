import {
  IndexerReadError,
  type Subname,
  type WrapperState,
} from '@ens-apps/indexer/reads'
import { QueryClient } from '@tanstack/react-query'
import { errAsync, ok, okAsync } from 'neverthrow'
import { keccak256, labelhash, stringToBytes } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { indexer } from '@/lib/indexer'
import {
  getSubnameLabelStatusQueryOptions,
  getSubnamePagesQueryOptions,
  getSubnamesCount,
  getSubnamesCountQueryOptions,
  getSubnamesQueryKey,
} from './useSubnames'

vi.mock('@/lib/indexer', () => ({
  indexer: { getSubnames: vi.fn(), getNameDetail: vi.fn() },
}))

const { mockClient, mockEnsjsGetOwner, mockReadContract } = vi.hoisted(() => {
  const mockReadContract = vi.fn()
  return {
    mockClient: { chain: { id: 11155111 }, readContract: mockReadContract },
    mockEnsjsGetOwner: vi.fn(),
    mockReadContract,
  }
})
vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok(mockClient),
}))
vi.mock('@ensdomains/ensjs/public/v1', () => ({
  getOwner: mockEnsjsGetOwner,
}))

const OWNER = '0x1234567890abcdef1234567890abcdef12345678'

const row = (label: string, overrides: Partial<Subname> = {}): Subname => ({
  name: `${label}.test.eth`,
  displayName: `${label}.test.eth`,
  namehash: '0x01',
  labelhash: labelhash(label),
  owner: OWNER,
  protocol: null,
  registrationStatus: 'active',
  expiresAt: null,
  wrapper: null,
  ...overrides,
})

const wrapper = (
  state: WrapperState,
  parentCannotControl = false,
): Subname['wrapper'] => ({
  state,
  fuses: 0,
  parentCannotControl,
  expiresAt: null,
})

const page = (
  items: readonly Subname[],
  {
    total,
    next = null,
  }: { readonly total: number; readonly next?: string | null },
) => okAsync({ items, nextCursor: next, totalCount: total })

const readError = (kind: IndexerReadError['kind']) =>
  errAsync(new IndexerReadError({ kind, message: kind, cause: null }))

const asked = (call = 0) => vi.mocked(indexer.getSubnames).mock.calls[call]

beforeEach(() => vi.clearAllMocks())

// The first page, as the subnames page reads it, for either era.
const firstPage = async (name: string) =>
  (
    await new QueryClient().fetchInfiniteQuery(
      getSubnamePagesQueryOptions({ name, protocolVersion: 'ENSv1' }),
    )
  ).pages[0]?.subnames ?? []

describe('subname pages', () => {
  it('lists a V1 name’s subnames from the indexer, holder as owner', async () => {
    vi.mocked(indexer.getSubnames).mockReturnValue(
      page([row('sub')], { total: 1 }),
    )

    const subnames = await firstPage('test.eth')

    expect(asked()).toEqual([
      {
        name: 'test.eth',
        includeExpired: false,
        pageSize: 100,
        includeCounts: true,
      },
      { signal: expect.any(AbortSignal) },
    ])
    expect(subnames).toEqual([
      {
        name: 'sub.test.eth',
        labelName: 'sub',
        labelhash: labelhash('sub'),
        owner: '0x1234567890AbcdEF1234567890aBcdef12345678',
        protocol: null,
        v1Wrapping: null,
        subnameCount: undefined,
      },
    ])
  })

  it('carries how the indexer says each V1 subname is held, and its count', async () => {
    vi.mocked(indexer.getSubnames).mockReturnValue(
      page(
        [
          row('plain', { wrapper: wrapper('unwrapped'), subnameCount: 0 }),
          row('wrapped', { wrapper: wrapper('wrapped') }),
          row('free', { wrapper: wrapper('emancipated') }),
          row('odd', { wrapper: wrapper('unknown') }),
        ],
        { total: 4 },
      ),
    )

    const subnames = await firstPage('test.eth')

    expect(
      subnames.map(({ v1Wrapping, subnameCount }) => ({
        v1Wrapping,
        subnameCount,
      })),
    ).toEqual([
      { v1Wrapping: { isWrapped: false }, subnameCount: 0 },
      {
        v1Wrapping: {
          isWrapped: true,
          parentCannotControl: false,
          isLocked: false,
        },
        subnameCount: undefined,
      },
      {
        v1Wrapping: {
          isWrapped: true,
          parentCannotControl: true,
          isLocked: false,
        },
        subnameCount: undefined,
      },
      { v1Wrapping: null, subnameCount: undefined },
    ])
  })

  it('marks a locked V1 subname, which its owner cannot unwrap to zero', async () => {
    vi.mocked(indexer.getSubnames).mockReturnValue(
      page(
        [
          row('locked', { wrapper: wrapper('locked') }),
          row('free', { wrapper: wrapper('emancipated') }),
        ],
        { total: 2 },
      ),
    )

    const subnames = await firstPage('test.eth')

    expect(
      subnames.map(({ v1Wrapping }) =>
        v1Wrapping?.isWrapped ? v1Wrapping.isLocked : null,
      ),
    ).toEqual([true, false])
  })

  it('counts expired children only when asked, as a row’s count does', async () => {
    vi.mocked(indexer.getSubnames).mockReturnValue(page([], { total: 7 }))

    expect(
      (
        await getSubnamesCount({
          name: 'test.eth',
          protocolVersion: 'ENSv1',
          includeExpired: true,
        })
      )._unsafeUnwrap(),
    ).toBe(7)
    expect(asked()[0]).toMatchObject({ includeExpired: true })

    await getSubnamesCount({ name: 'test.eth', protocolVersion: 'ENSv1' })
    expect(asked(1)[0]).toMatchObject({ includeExpired: false })
  })

  it('carries the era the indexer serves each subname from', async () => {
    vi.mocked(indexer.getSubnames).mockReturnValue(
      page(
        [
          row('old', { protocol: 'v1' }),
          row('new', { protocol: 'v2' }),
          row('unsaid'),
        ],
        { total: 3 },
      ),
    )

    const subnames = await firstPage('test.eth')

    expect(subnames.map(({ protocol }) => protocol)).toEqual(['v1', 'v2', null])
  })

  it('asks for counts only on V1 pages', async () => {
    vi.mocked(indexer.getSubnames).mockReturnValue(page([], { total: 0 }))

    await new QueryClient().fetchInfiniteQuery(
      getSubnamePagesQueryOptions({
        name: 'test.eth',
        protocolVersion: 'ENSv2',
      }),
    )

    expect(asked()[0]).not.toHaveProperty('includeCounts')
  })

  it('keeps a child the indexer cannot label as its placeholder, and drops rows with no holder', async () => {
    const hash = labelhash('secret')
    vi.mocked(indexer.getSubnames).mockReturnValue(
      page(
        [
          row('secret', { name: `[${hash.slice(2)}].test.eth` }),
          row('gone', { owner: null }),
        ],
        { total: 2 },
      ),
    )

    const subnames = await firstPage('test.eth')

    expect(subnames).toEqual([
      expect.objectContaining({
        name: `[${hash.slice(2)}].test.eth`,
        labelName: null,
        labelhash: hash,
      }),
    ])
  })

  it('names subnames from the parent it was asked about', async () => {
    vi.mocked(indexer.getSubnames).mockReturnValue(
      page([row('sub', { name: 'sub.[abc].eth' })], { total: 1 }),
    )

    const [subname] = await firstPage('healed.eth')

    expect(subname?.name).toBe('sub.healed.eth')
  })
})

describe('getSubnamePagesQueryOptions', () => {
  const options = getSubnamePagesQueryOptions({
    name: 'test.eth',
    protocolVersion: 'ENSv2',
  })

  it('loads one page with the name’s total', async () => {
    vi.mocked(indexer.getSubnames).mockReturnValue(
      page([row('a')], { total: 2, next: 'next' }),
    )

    const data = await new QueryClient().fetchInfiniteQuery(options)

    expect(indexer.getSubnames).toHaveBeenCalledTimes(1)
    expect(data.pages[0]?.totalCount).toBe(2)
  })

  it('reads the next page from the indexer’s cursor', async () => {
    vi.mocked(indexer.getSubnames)
      .mockReturnValueOnce(page([row('a')], { total: 2, next: 'next' }))
      .mockReturnValueOnce(page([row('b')], { total: 2 }))

    const data = await new QueryClient().fetchInfiniteQuery({
      ...options,
      pages: 2,
    })

    expect(asked(1)?.[0]).toMatchObject({ cursor: 'next' })
    expect(
      data.pages.flatMap((p) => p.subnames.map((s) => s.labelName)),
    ).toEqual(['a', 'b'])
  })

  it('has no next page once the indexer has no cursor', () => {
    expect(
      options.getNextPageParam(
        { subnames: [], totalCount: 5, nextCursor: null },
        [],
        undefined,
        [],
      ),
    ).toBeUndefined()
  })

  it('is empty for a name the indexer has not indexed, and fails on other errors', async () => {
    vi.mocked(indexer.getSubnames).mockReturnValueOnce(
      okAsync({ items: [], nextCursor: null, totalCount: 0 }),
    )
    const data = await new QueryClient().fetchInfiniteQuery(options)
    expect(data.pages[0]).toEqual({
      subnames: [],
      totalCount: 0,
      nextCursor: null,
    })

    vi.mocked(indexer.getSubnames).mockReturnValueOnce(readError('unavailable'))
    await expect(
      new QueryClient().fetchInfiniteQuery(options),
    ).rejects.toMatchObject({ _tag: 'GetSubnamesError' })
  })

  it('is invalidated by the name’s subnames key', async () => {
    vi.mocked(indexer.getSubnames).mockReturnValue(
      page([row('a')], { total: 1 }),
    )
    const queryClient = new QueryClient()
    await queryClient.fetchInfiniteQuery(options)

    await queryClient.invalidateQueries({
      queryKey: getSubnamesQueryKey({
        name: 'test.eth',
        protocolVersion: 'ENSv2',
      }),
      refetchType: 'none',
    })

    expect(queryClient.getQueryState(options.queryKey)?.isInvalidated).toBe(
      true,
    )
  })
})

describe('getSubnamesCountQueryOptions', () => {
  it.each(['ENSv1', 'ENSv2'] as const)(
    'reads the %s count as the indexer’s total, without listing the subnames',
    async (protocolVersion) => {
      vi.mocked(indexer.getSubnames).mockReturnValue(
        page([row('a')], { total: 7 }),
      )

      const count = await new QueryClient().fetchQuery(
        getSubnamesCountQueryOptions({ name: 'test.eth', protocolVersion }),
      )

      expect(count).toBe(7)
      expect(asked()?.[0]).toMatchObject({ pageSize: 1 })
    },
  )
})

describe('getSubnameLabelStatusQueryOptions', () => {
  const REGISTRY = '0x1111111111111111111111111111111111111111'
  const v2Status = () =>
    new QueryClient().fetchQuery(
      getSubnameLabelStatusQueryOptions({
        name: 'test.eth',
        label: 'sub',
        protocolVersion: 'ENSv2',
        registryAddress: REGISTRY,
      }),
    )

  it('asks the subregistry about the label, not the indexer', async () => {
    mockReadContract.mockResolvedValue(2)

    expect(await v2Status()).toBe('registered')
    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: REGISTRY,
        functionName: 'getStatus',
        args: [BigInt(keccak256(stringToBytes('sub')))],
      }),
    )
    expect(indexer.getNameDetail).not.toHaveBeenCalled()
    expect(indexer.getSubnames).not.toHaveBeenCalled()
  })

  it('is available once a label has expired, and tells a reservation apart', async () => {
    mockReadContract.mockResolvedValue(0)
    expect(await v2Status()).toBe('available')

    mockReadContract.mockResolvedValue(1)
    expect(await v2Status()).toBe('reserved')
  })

  it('fails on a status the registry does not define', async () => {
    mockReadContract.mockResolvedValue(3)

    await expect(v2Status()).rejects.toThrow()
  })

  const v1Status = () =>
    new QueryClient().fetchQuery(
      getSubnameLabelStatusQueryOptions({
        name: 'test.eth',
        label: 'sub',
        protocolVersion: 'ENSv1',
      }),
    )

  it('reads a V1 subname from the registry, not the indexer', async () => {
    mockEnsjsGetOwner.mockResolvedValue({
      owner: OWNER,
      ownershipLevel: 'registry',
    })

    expect(await v1Status()).toBe('registered')
    expect(mockEnsjsGetOwner).toHaveBeenCalledWith(mockClient, {
      name: 'sub.test.eth',
    })
    expect(indexer.getNameDetail).not.toHaveBeenCalled()
    expect(indexer.getSubnames).not.toHaveBeenCalled()
  })

  it('is available when the V1 registry has no owner for the subname', async () => {
    mockEnsjsGetOwner.mockResolvedValue(null)

    expect(await v1Status()).toBe('available')
  })
})
