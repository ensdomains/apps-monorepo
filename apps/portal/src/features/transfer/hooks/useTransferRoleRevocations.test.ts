// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { ok } from 'neverthrow'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const OWNER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const MANAGER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address
const REGISTRY = '0x1111111111111111111111111111111111111111' as Address

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ chain: { id: 11155111 } }),
}))

type QueryStub = {
  data: unknown
  isError: boolean
  isFetching: boolean
}

const settled = (data: unknown): QueryStub => ({
  data,
  isError: false,
  isFetching: false,
})

const resourceQuery: QueryStub = settled(1n)
const accountsQuery: QueryStub = settled(undefined)
const ownerRolesQuery: QueryStub = settled(undefined)
const rootHoldersQuery: QueryStub = settled([])

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQuery: () => resourceQuery,
    useQueries: ({
      queries,
    }: {
      queries: { queryKey: readonly unknown[] }[]
    }) =>
      queries.map(({ queryKey }) => {
        switch (queryKey[0]) {
          case 'get-name-roles-accounts':
            return accountsQuery
          case 'getNameRolesForAccount':
            return ownerRolesQuery
          case 'get-registry-root-role-holders':
            return rootHoldersQuery
          default:
            return settled(undefined)
        }
      }),
  }
})

const { useTransferRoleRevocations } = await import(
  './useTransferRoleRevocations'
)

const render = () =>
  renderHook(() =>
    useTransferRoleRevocations({
      name: 'name.eth',
      registryAddress: REGISTRY,
      owner: OWNER,
    }),
  ).result.current

const holders = (entries: [Address, string[]][]) => new Map(entries)

describe('useTransferRoleRevocations', () => {
  beforeEach(() => {
    Object.assign(resourceQuery, settled(1n))
    Object.assign(
      ownerRolesQuery,
      settled({ decoded: ['ROLE_SET_RESOLVER_ADMIN'] }),
    )
    Object.assign(rootHoldersQuery, settled([]))
  })

  it('plans the revoke from a verified list', () => {
    Object.assign(
      accountsQuery,
      settled({
        holders: holders([
          [OWNER, ['ROLE_SET_RESOLVER_ADMIN']],
          [MANAGER, ['ROLE_SET_RESOLVER']],
        ]),
        isVerified: true,
      }),
    )

    expect(render()).toEqual({
      status: 'ready',
      holders: [{ account: MANAGER, roles: ['ROLE_SET_RESOLVER'] }],
      revocable: [{ account: MANAGER, roles: ['ROLE_SET_RESOLVER'] }],
      unrevocable: [],
    })
  })

  it('reports a verified list with no one else as ready and empty', () => {
    Object.assign(
      accountsQuery,
      settled({
        holders: holders([[OWNER, ['ROLE_SET_RESOLVER_ADMIN']]]),
        isVerified: true,
      }),
    )

    expect(render()).toMatchObject({ status: 'ready', holders: [] })
  })

  // An unverified list may be missing a holder, and a missing holder would
  // keep their grant through the transfer, so it must never plan from it.
  it('errors on an unverified list, even one naming a holder', () => {
    Object.assign(
      accountsQuery,
      settled({
        holders: holders([
          [OWNER, ['ROLE_SET_RESOLVER_ADMIN']],
          [MANAGER, ['ROLE_SET_RESOLVER']],
        ]),
        isVerified: false,
      }),
    )

    expect(render()).toEqual({ status: 'error' })
  })

  it('errors on an unverified list naming no one else, rather than reading as "nobody"', () => {
    Object.assign(
      accountsQuery,
      settled({
        holders: holders([[OWNER, ['ROLE_SET_RESOLVER_ADMIN']]]),
        isVerified: false,
      }),
    )

    expect(render()).toEqual({ status: 'error' })
  })

  it('stays pending while an unverified list is refetching', () => {
    Object.assign(accountsQuery, {
      data: { holders: holders([]), isVerified: false },
      isError: false,
      isFetching: true,
    })

    expect(render()).toEqual({ status: 'pending' })
  })
})
