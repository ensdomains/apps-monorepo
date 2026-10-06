import type { AddressNameRow } from '@ens-apps/bigname'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { namehash } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useV1Names } from '../migration/hooks/useV1Names'
import { DashboardNamesProvider } from './DashboardNamesProvider'
import {
  getDashboardAuthorityNamesQuery,
  getDashboardNameRowsQuery,
} from './service/queries/getDashboardNames'
import { useDashboardNames } from './useDashboardNames'

const mocks = vi.hoisted(() => ({
  listAddressNames: vi.fn(),
  lookup: vi.fn(),
  accountAddress: undefined as string | undefined,
}))
const OWNER = '0x1111111111111111111111111111111111111111'
vi.mock('@/lib/bigname', () => ({ bigname: mocks }))
vi.mock('wagmi', () => ({
  useConnection: () => ({
    address: '0x1111111111111111111111111111111111111111',
  }),
}))
vi.mock('@/lib/smart-account', () => ({
  useSmartAccountContext: () => ({
    ownerAddress: '0x1111111111111111111111111111111111111111',
  }),
}))
vi.mock('@/lib/smart-account/SmartAccountContext', () => ({
  useSmartAccountContextSafe: () => ({
    accountAddress: mocks.accountAddress,
    ownerAddress: '0x1111111111111111111111111111111111111111',
  }),
}))

const row = (
  name: string,
  authority: 'ens_v1' | 'ens_v2' = 'ens_v1',
): AddressNameRow => ({
  name,
  display_name: name,
  namespace: 'ens',
  namehash: namehash(name),
  authority,
  registration_status: 'active',
  owner: OWNER,
  manager: OWNER,
  created_at: '1700000000',
  relations: ['owner', 'manager'],
  is_primary: false,
  ...(authority === 'ens_v1' ? { ens_v1: { expires_at: '1893456000' } } : {}),
})
const page = (data: readonly AddressNameRow[], next: string | null = null) => ({
  data,
  page: {
    cursor: null,
    next_cursor: next,
    page_size: data.length,
    total_count: null,
    has_more: next !== null,
  },
  meta: {},
})
const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrapper =
  (client: QueryClient, dashboard = true) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      {dashboard ? (
        <DashboardNamesProvider>{children}</DashboardNamesProvider>
      ) : (
        children
      )}
    </QueryClientProvider>
  )

beforeEach(() => {
  vi.clearAllMocks()
  mocks.accountAddress = undefined
  mocks.listAddressNames.mockImplementation(async (_address, params) =>
    page(
      params.relation === 'former_owner'
        ? []
        : [row('legacy.eth'), row('new.eth', 'ens_v2')],
    ),
  )
  mocks.lookup.mockImplementation(async ({ inputs }) => ({
    data: inputs.map((input: { name: string }) => ({
      input,
      kind: 'name',
      status: 'ok',
      record: { ...row(input.name), status: 'ok' },
    })),
    meta: {},
  }))
})

describe('dashboard and migration discovery', () => {
  it('shares in-flight discovery even when migration renders before the table', async () => {
    const client = makeClient()
    const { result } = renderHook(
      () => ({ migration: useV1Names(), dashboard: useDashboardNames() }),
      { wrapper: wrapper(client) },
    )
    await waitFor(() => expect(result.current.migration.isSuccess).toBe(true))
    expect(result.current.dashboard.names).toHaveLength(2)
    expect(result.current.migration.data?.map(({ name }) => name)).toEqual([
      'legacy.eth',
    ])
    expect(mocks.listAddressNames).toHaveBeenCalledTimes(2)
    expect(mocks.lookup).toHaveBeenCalledTimes(1)
    expect(
      mocks.listAddressNames.mock.calls.every(
        ([, params]) => !params.authority || params.relation === 'former_owner',
      ),
    ).toBe(true)
    expect(mocks.lookup.mock.calls[0]?.[0].inputs).toEqual([
      { name: 'legacy.eth' },
    ])
  })

  it('reuses a fresh complete dashboard snapshot after navigating to migration', async () => {
    const client = makeClient()
    await client.fetchQuery(getDashboardNameRowsQuery([OWNER]))
    mocks.listAddressNames.mockClear()
    const { result } = renderHook(() => useV1Names(), {
      wrapper: wrapper(client, false),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocks.listAddressNames).not.toHaveBeenCalled()
    expect(mocks.lookup).toHaveBeenCalledTimes(1)
  })

  it('uses cached migration results on remount without another request', async () => {
    const client = makeClient()
    const first = renderHook(() => useV1Names(), {
      wrapper: wrapper(client, false),
    })
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true))
    first.unmount()
    mocks.listAddressNames.mockClear()
    mocks.lookup.mockClear()
    const second = renderHook(() => useV1Names(), {
      wrapper: wrapper(client, false),
    })
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true))
    expect(mocks.listAddressNames).not.toHaveBeenCalled()
    expect(mocks.lookup).not.toHaveBeenCalled()
  })

  it('does not reuse an expired dashboard cache for standalone migration', async () => {
    const client = makeClient()
    const source = getDashboardAuthorityNamesQuery(OWNER)
    const collections = await client.fetchQuery(source)
    client.setQueryData(source.queryKey, collections, {
      updatedAt: Date.now() - 6 * 60 * 1000,
    })
    mocks.listAddressNames.mockClear()
    const { result } = renderHook(() => useV1Names(), {
      wrapper: wrapper(client, false),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocks.listAddressNames.mock.calls[0]?.[1].authority).toEqual([
      'ens_v1',
      'ens_v0',
    ])
  })

  it('retains server-side ENSv1 filtering on cold standalone discovery', async () => {
    const client = makeClient()
    const { result } = renderHook(() => useV1Names(), {
      wrapper: wrapper(client, false),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocks.listAddressNames).toHaveBeenCalledTimes(1)
    expect(mocks.listAddressNames.mock.calls[0]?.[1].authority).toEqual([
      'ens_v1',
      'ens_v0',
    ])
    expect(mocks.lookup).toHaveBeenCalledTimes(1)
  })

  it('does not reuse invalidated dashboard data for standalone migration', async () => {
    const client = makeClient()
    await client.fetchQuery(getDashboardNameRowsQuery([OWNER]))
    await client.invalidateQueries({ queryKey: qk('dashboard', 'names') })
    mocks.listAddressNames.mockClear()
    const { result } = renderHook(() => useV1Names(), {
      wrapper: wrapper(client, false),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocks.listAddressNames.mock.calls[0]?.[1].authority).toEqual([
      'ens_v1',
      'ens_v0',
    ])
  })

  it('reads a large mixed wallet once, looking up only ENSv1 records', async () => {
    const mixed = Array.from({ length: 400 }, (_, i) =>
      row(`new${i}.eth`, 'ens_v2'),
    )
    mocks.listAddressNames.mockImplementation(async (_address, params) => {
      if (params.relation === 'former_owner') return page([])
      const offset = Number(params.cursor ?? 0)
      const all = [...mixed, row('legacy.eth')]
      return page(
        all.slice(offset, offset + 200),
        offset + 200 < all.length ? String(offset + 200) : null,
      )
    })
    const client = makeClient()
    const { result } = renderHook(
      () => ({ migration: useV1Names(), dashboard: useDashboardNames() }),
      { wrapper: wrapper(client) },
    )
    await waitFor(() => expect(result.current.migration.isSuccess).toBe(true))
    expect(result.current.dashboard.names).toHaveLength(401)
    expect(mocks.listAddressNames).toHaveBeenCalledTimes(4)
    expect(mocks.lookup).toHaveBeenCalledTimes(1)
    expect(mocks.lookup.mock.calls[0]?.[0].inputs).toEqual([
      { name: 'legacy.eth' },
    ])
  })

  it('refreshes discovery when migration is explicitly refetched after renewal', async () => {
    const client = makeClient()
    const { result } = renderHook(
      () => ({ migration: useV1Names(), dashboard: useDashboardNames() }),
      { wrapper: wrapper(client) },
    )
    await waitFor(() => expect(result.current.migration.isSuccess).toBe(true))
    expect(result.current.migration.data?.map(({ name }) => name)).toEqual([
      'legacy.eth',
    ])
    mocks.listAddressNames.mockImplementation(async (_address, params) =>
      page(params.relation === 'former_owner' ? [] : [row('renewed.eth')]),
    )
    await act(async () => {
      const refreshed = await result.current.migration.refetch()
      expect(refreshed.data?.map(({ name }) => name)).toEqual(['renewed.eth'])
    })
    await waitFor(() =>
      expect(result.current.migration.data?.map(({ name }) => name)).toEqual([
        'renewed.eth',
      ]),
    )
    expect(mocks.listAddressNames).toHaveBeenCalledTimes(3)
    expect(mocks.lookup).toHaveBeenCalledTimes(2)
  })

  it.each([
    'grace',
    'other-address',
  ] as const)('migration succeeds when %s discovery fails', async (failure) => {
    const smart = '0x2222222222222222222222222222222222222222'
    if (failure === 'other-address') mocks.accountAddress = smart
    mocks.listAddressNames.mockImplementation(async (address, params) => {
      if (failure === 'grace' && params.relation === 'former_owner')
        throw new Error('grace unavailable')
      if (failure === 'other-address' && address === smart)
        throw new Error('smart account unavailable')
      return page(params.relation === 'former_owner' ? [] : [row('legacy.eth')])
    })
    const client = makeClient()
    const { result } = renderHook(
      () => ({ migration: useV1Names(), dashboard: useDashboardNames() }),
      { wrapper: wrapper(client) },
    )
    await waitFor(() => expect(result.current.migration.isSuccess).toBe(true))
    expect(result.current.migration.data?.map(({ name }) => name)).toEqual([
      'legacy.eth',
    ])
    expect(result.current.dashboard.isError).toBe(true)
    expect(mocks.lookup).toHaveBeenCalledTimes(1)
    expect(
      mocks.listAddressNames.mock.calls.filter(
        ([address, params]) => address === OWNER && params.relation === 'any',
      ),
    ).toHaveLength(1)
  })

  it('migration need not wait for an unrelated slow grace collection', async () => {
    let finishGrace: ((value: ReturnType<typeof page>) => void) | undefined
    mocks.listAddressNames.mockImplementation(async (_address, params) =>
      params.relation === 'former_owner'
        ? new Promise<ReturnType<typeof page>>((resolve) => {
            finishGrace = resolve
          })
        : page([row('legacy.eth')]),
    )
    const client = makeClient()
    const { result } = renderHook(
      () => ({ migration: useV1Names(), dashboard: useDashboardNames() }),
      { wrapper: wrapper(client) },
    )
    await waitFor(() => expect(result.current.migration.isSuccess).toBe(true))
    expect(result.current.dashboard.isPending).toBe(true)
    await act(async () => {
      finishGrace?.(page([]))
    })
    await waitFor(() => expect(result.current.dashboard.isPending).toBe(false))
    expect(mocks.listAddressNames).toHaveBeenCalledTimes(2)
    expect(mocks.lookup).toHaveBeenCalledTimes(1)
  })

  it('a dashboard refresh updates its shared authority collection', async () => {
    const client = makeClient()
    const source = getDashboardNameRowsQuery([OWNER])
    await client.fetchQuery(source)
    mocks.listAddressNames.mockImplementation(async (_address, params) =>
      page(params.relation === 'former_owner' ? [] : [row('renewed.eth')]),
    )
    await client.fetchQuery({ ...source, staleTime: 0 })
    expect(
      client
        .getQueryData(getDashboardAuthorityNamesQuery(OWNER).queryKey)
        ?.map(({ name }) => name),
    ).toEqual(['renewed.eth'])
    expect(mocks.listAddressNames).toHaveBeenCalledTimes(4)
  })

  it('propagates discovery failure without looking up partial rows', async () => {
    mocks.listAddressNames.mockRejectedValue(new Error('unavailable'))
    const client = makeClient()
    const { result } = renderHook(
      () => ({ migration: useV1Names(), dashboard: useDashboardNames() }),
      { wrapper: wrapper(client) },
    )
    await waitFor(() => expect(result.current.migration.isError).toBe(true))
    expect(result.current.dashboard.isError).toBe(true)
    expect(mocks.lookup).not.toHaveBeenCalled()
  })

  it('rejects truncated shared discovery without a migration lookup', async () => {
    mocks.listAddressNames.mockImplementation(async (_address, params) =>
      params.relation === 'former_owner'
        ? page([])
        : page([row('legacy.eth')], 'next'),
    )
    const client = makeClient()
    const { result } = renderHook(() => useV1Names(), {
      wrapper: wrapper(client),
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(mocks.lookup).not.toHaveBeenCalled()
  })

  it('cancels migration without cancelling shared dashboard discovery or starting detail reads', async () => {
    let finish: ((value: ReturnType<typeof page>) => void) | undefined
    mocks.listAddressNames.mockImplementation(async (_address, params) =>
      params.relation === 'former_owner'
        ? page([])
        : new Promise<ReturnType<typeof page>>((resolve) => {
            finish = resolve
          }),
    )
    const client = makeClient()
    const { result } = renderHook(
      () => ({ migration: useV1Names(), dashboard: useDashboardNames() }),
      { wrapper: wrapper(client) },
    )
    await waitFor(() => expect(finish).toBeDefined())
    await act(async () => {
      await client.cancelQueries({ queryKey: qk('migration', 'v1_names') })
      finish?.(page([row('legacy.eth')]))
    })
    await waitFor(() => expect(result.current.dashboard.isPending).toBe(false))
    expect(result.current.dashboard.names).toHaveLength(1)
    expect(mocks.lookup).not.toHaveBeenCalled()
  })
})
