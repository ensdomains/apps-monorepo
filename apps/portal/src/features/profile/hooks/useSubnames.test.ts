import {
  BignameError,
  type NameRecord,
  type Subname,
} from '@ens-apps/indexer/bigname'
import { QueryClient } from '@tanstack/react-query'
import { errAsync, okAsync } from 'neverthrow'
import { labelhash } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bigname } from '@/lib/bigname'
import {
  getIsSubnameTakenQueryOptions,
  getSubnamesCountQueryOptions,
  getSubnamesQueryKey,
  getV1Subnames,
  getV2SubnamesQueryOptions,
} from './useSubnames'

vi.mock('@/lib/bigname', () => ({
  bigname: { subnames: vi.fn(), name: vi.fn() },
}))

const OWNER = '0x1234567890abcdef1234567890abcdef12345678'

const row = (label: string, overrides: Partial<Subname> = {}): Subname => ({
  name: `${label}.test.eth`,
  display_name: `${label}.test.eth`,
  namespace: 'ens',
  namehash: '0x01',
  labelhash: labelhash(label),
  owner: OWNER,
  status: 'active',
  ...overrides,
})

const page = (
  data: readonly Subname[],
  {
    total,
    next = null,
  }: { readonly total: number; readonly next?: string | null },
) =>
  okAsync({
    data,
    page: {
      cursor: null,
      next_cursor: next,
      page_size: data.length,
      total_count: total,
      has_more: next !== null,
    },
    meta: { as_of: {} },
  })

const asked = (call = 0) => vi.mocked(bigname.subnames).mock.calls[call]

beforeEach(() => vi.clearAllMocks())

describe('getV1Subnames', () => {
  it('lists a V1 name’s subnames from bigname, holder as owner', async () => {
    vi.mocked(bigname.subnames).mockReturnValue(
      page([row('sub')], { total: 1 }),
    )

    const subnames = (await getV1Subnames({ name: 'test.eth' }))._unsafeUnwrap()

    expect(asked()).toEqual([
      'test.eth',
      {
        namespace: 'ens',
        include_expired: 'false',
        sort: 'name',
        page_size: 200,
      },
    ])
    expect(subnames).toEqual([
      {
        name: 'sub.test.eth',
        labelName: 'sub',
        labelhash: labelhash('sub'),
        owner: '0x1234567890AbcdEF1234567890aBcdef12345678',
      },
    ])
  })

  it('keeps a child bigname cannot label as its placeholder, and drops rows with no holder', async () => {
    const hash = labelhash('secret')
    vi.mocked(bigname.subnames).mockReturnValue(
      page(
        [
          row('secret', { name: `[${hash.slice(2)}].test.eth` }),
          row('gone', { owner: undefined }),
        ],
        { total: 2 },
      ),
    )

    const subnames = (await getV1Subnames({ name: 'test.eth' }))._unsafeUnwrap()

    expect(subnames).toEqual([
      expect.objectContaining({
        name: `[${hash.slice(2)}].test.eth`,
        labelName: null,
        labelhash: hash,
      }),
    ])
  })

  it('names subnames from the parent it was asked about', async () => {
    vi.mocked(bigname.subnames).mockReturnValue(
      page([row('sub', { name: 'sub.[abc].eth' })], { total: 1 }),
    )

    const [subname] = (
      await getV1Subnames({ name: 'healed.eth' })
    )._unsafeUnwrap()

    expect(subname?.name).toBe('sub.healed.eth')
  })
})

describe('getV2SubnamesQueryOptions', () => {
  const options = getV2SubnamesQueryOptions({ name: 'test.eth' })

  it('loads one page with the name’s total', async () => {
    vi.mocked(bigname.subnames).mockReturnValue(
      page([row('a')], { total: 2, next: 'next' }),
    )

    const data = await new QueryClient().fetchInfiniteQuery(options)

    expect(bigname.subnames).toHaveBeenCalledTimes(1)
    expect(data.pages[0]?.totalCount).toBe(2)
  })

  it('reads the next page from bigname’s cursor', async () => {
    vi.mocked(bigname.subnames)
      .mockReturnValueOnce(page([row('a')], { total: 2, next: 'next' }))
      .mockReturnValueOnce(page([row('b')], { total: 2 }))

    const data = await new QueryClient().fetchInfiniteQuery({
      ...options,
      pages: 2,
    })

    expect(asked(1)?.[1]).toMatchObject({ cursor: 'next' })
    expect(
      data.pages.flatMap((p) => p.subnames.map((s) => s.labelName)),
    ).toEqual(['a', 'b'])
  })

  it('has no next page once bigname has no cursor', () => {
    expect(
      options.getNextPageParam(
        { subnames: [], totalCount: 5, nextCursor: null },
        [],
        undefined,
        [],
      ),
    ).toBeUndefined()
  })

  it('is empty for a name bigname has not indexed, and fails on other errors', async () => {
    vi.mocked(bigname.subnames).mockReturnValueOnce(
      errAsync(new BignameError({ code: 'not_found', message: 'gone' })),
    )
    const data = await new QueryClient().fetchInfiniteQuery(options)
    expect(data.pages[0]).toEqual({
      subnames: [],
      totalCount: 0,
      nextCursor: null,
    })

    vi.mocked(bigname.subnames).mockReturnValueOnce(
      errAsync(new BignameError({ code: 'overloaded', message: 'busy' })),
    )
    await expect(
      new QueryClient().fetchInfiniteQuery(options),
    ).rejects.toMatchObject({ _tag: 'GetSubnamesError' })
  })

  it('is invalidated by the name’s subnames key', async () => {
    vi.mocked(bigname.subnames).mockReturnValue(page([row('a')], { total: 1 }))
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
  it.each([
    'ENSv1',
    'ENSv2',
  ] as const)('reads the %s count as bigname’s total, without listing the subnames', async (protocolVersion) => {
    vi.mocked(bigname.subnames).mockReturnValue(page([row('a')], { total: 7 }))

    const count = await new QueryClient().fetchQuery(
      getSubnamesCountQueryOptions({ name: 'test.eth', protocolVersion }),
    )

    expect(count).toBe(7)
    expect(asked()?.[1]).toMatchObject({ page_size: 1 })
  })
})

describe('getIsSubnameTakenQueryOptions', () => {
  const detail = (overrides: Partial<NameRecord>) =>
    vi.mocked(bigname.name).mockReturnValue(
      okAsync({
        data: {
          name: 'sub.test.eth',
          display_name: 'sub.test.eth',
          namespace: 'ens',
          namehash: '0x01',
          read_status: 'ok',
          ...overrides,
        },
        meta: { as_of: {} },
      }),
    )
  const isTaken = () =>
    new QueryClient().fetchQuery(
      getIsSubnameTakenQueryOptions({ name: 'test.eth', label: 'sub' }),
    )

  it('asks bigname about the one subname', async () => {
    detail({ status: 'active' })

    expect(await isTaken()).toBe(true)
    expect(bigname.name).toHaveBeenCalledWith('sub.test.eth')
  })

  it('is free when the subname was released or never registered', async () => {
    detail({ status: 'released' })
    expect(await isTaken()).toBe(false)

    vi.mocked(bigname.name).mockReturnValue(
      errAsync(new BignameError({ code: 'not_found', message: 'gone' })),
    )
    expect(await isTaken()).toBe(false)
  })
})
