import type { DomainFragment } from '@ens-apps/indexer'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const reactQueryMock = vi.hoisted(() => ({
  useInfiniteQuery: vi.fn(),
  useQuery: vi.fn(),
}))

const wagmiMock = vi.hoisted(() => ({
  useConnection: vi.fn(),
}))

const smartAccountMock = vi.hoisted(() => ({
  useSmartAccountContextSafe: vi.fn(),
}))

const domainsQueryMock = vi.hoisted(() => ({
  getAllDomainsInfiniteQuery: vi.fn(() => ({ queryKey: ['domains'] })),
}))

const roleAssignmentsQueryMock = vi.hoisted(() => ({
  getDashboardRoleAssignmentsQuery: vi.fn(() => ({ queryKey: ['roles'] })),
}))

vi.mock('@tanstack/react-query', () => reactQueryMock)
vi.mock('wagmi', () => wagmiMock)
vi.mock('@/lib/smart-account/SmartAccountContext', () => smartAccountMock)
vi.mock('./service/queries/getAllDashboardDomains', () => domainsQueryMock)
vi.mock(
  './service/queries/getDashboardRoleAssignments',
  () => roleAssignmentsQueryMock,
)

import { useOwnedDomains } from './useOwnedDomains'

const makeDomain = (overrides: Partial<DomainFragment> = {}): DomainFragment =>
  ({
    __typename: 'Domain',
    id: overrides.id ?? '0x1',
    name: overrides.name ?? 'alaska.eth',
    normalizedName: overrides.normalizedName ?? overrides.name ?? 'alaska.eth',
    tokenId: overrides.tokenId ?? null,
    createdAt: overrides.createdAt ?? 0,
    registrationDate: null,
    expiryDate: overrides.expiryDate ?? null,
    owner: overrides.owner ?? {
      __typename: 'Account',
      id: '0xowner',
    },
    resolver: overrides.resolver ?? null,
  }) as DomainFragment

describe('useOwnedDomains', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    wagmiMock.useConnection.mockReturnValue({
      address: '0xABCDEF0123456789ABCDEF0123456789ABCDEF01',
    })
    smartAccountMock.useSmartAccountContextSafe.mockReturnValue({
      accountAddress: '0x0000000000000000000000000000000000000002',
      ownerAddress: '0xABCDEF0123456789ABCDEF0123456789ABCDEF01',
      isAccountReady: true,
      error: null,
    })
    reactQueryMock.useInfiniteQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetching: false,
      isFetchingNextPage: false,
    })
    reactQueryMock.useQuery.mockReturnValue({
      data: [],
      isPending: false,
    })
  })

  it('applies V2 role assignments to owned domains', () => {
    reactQueryMock.useInfiniteQuery.mockReturnValue({
      data: [makeDomain()],
      isPending: false,
      isError: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetching: false,
      isFetchingNextPage: false,
    })
    reactQueryMock.useQuery.mockReturnValue({
      data: [{ name: 'alaska.eth', roleBitmap: '1' }],
      isPending: false,
    })

    const { result } = renderHook(() => useOwnedDomains())

    expect(result.current.v2Names[0]?.nameRoles).toEqual(['owner', 'manager'])
    expect(
      roleAssignmentsQueryMock.getDashboardRoleAssignmentsQuery,
    ).toHaveBeenCalledWith([
      '0xabcdef0123456789abcdef0123456789abcdef01',
      '0x0000000000000000000000000000000000000002',
    ])
  })

  it('surfaces role assignment query failures as dashboard errors', () => {
    reactQueryMock.useInfiniteQuery.mockReturnValue({
      data: [makeDomain()],
      isPending: false,
      isError: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetching: false,
      isFetchingNextPage: false,
    })
    reactQueryMock.useQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    })

    const { result } = renderHook(() => useOwnedDomains())

    expect(result.current.isError).toBe(true)
  })

  it('requests the next page without cancelling an in-flight page request', () => {
    const fetchNextPage = vi.fn().mockResolvedValue(undefined)
    reactQueryMock.useInfiniteQuery.mockReturnValue({
      data: [makeDomain()],
      isPending: false,
      isError: false,
      fetchNextPage,
      hasNextPage: true,
      isFetching: false,
      isFetchingNextPage: false,
    })

    renderHook(() => useOwnedDomains())

    expect(fetchNextPage).toHaveBeenCalledExactlyOnceWith({
      cancelRefetch: false,
    })
  })

  it('waits for the HCA address before fetching the wallet name list', () => {
    smartAccountMock.useSmartAccountContextSafe.mockReturnValue({
      accountAddress: null,
      ownerAddress: '0xABCDEF0123456789ABCDEF0123456789ABCDEF01',
      isAccountReady: false,
      error: null,
    })

    const { result, rerender } = renderHook(() => useOwnedDomains())

    expect(result.current.isPending).toBe(true)
    expect(
      domainsQueryMock.getAllDomainsInfiniteQuery,
    ).toHaveBeenLastCalledWith(undefined)
    expect(
      roleAssignmentsQueryMock.getDashboardRoleAssignmentsQuery,
    ).toHaveBeenLastCalledWith(undefined)

    smartAccountMock.useSmartAccountContextSafe.mockReturnValue({
      accountAddress: '0x0000000000000000000000000000000000000002',
      ownerAddress: '0xABCDEF0123456789ABCDEF0123456789ABCDEF01',
      isAccountReady: true,
      error: null,
    })
    rerender()

    expect(
      domainsQueryMock.getAllDomainsInfiniteQuery,
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          owner_in: [
            '0xabcdef0123456789abcdef0123456789abcdef01',
            '0x0000000000000000000000000000000000000002',
          ],
        },
      }),
    )
  })

  it('fetches from the EOA after a bounded HCA wait', () => {
    vi.useFakeTimers()
    try {
      smartAccountMock.useSmartAccountContextSafe.mockReturnValue({
        accountAddress: null,
        ownerAddress: '0xABCDEF0123456789ABCDEF0123456789ABCDEF01',
        isAccountReady: false,
        error: null,
      })

      renderHook(() => useOwnedDomains())
      expect(
        domainsQueryMock.getAllDomainsInfiniteQuery,
      ).toHaveBeenLastCalledWith(undefined)

      act(() => vi.advanceTimersByTime(5_000))

      expect(
        domainsQueryMock.getAllDomainsInfiniteQuery,
      ).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: {
            owner_in: ['0xabcdef0123456789abcdef0123456789abcdef01'],
          },
        }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('fetches EOA-only mode without waiting for an HCA', () => {
    smartAccountMock.useSmartAccountContextSafe.mockReturnValue({
      accountAddress: '0xABCDEF0123456789ABCDEF0123456789ABCDEF01',
      ownerAddress: '0xABCDEF0123456789ABCDEF0123456789ABCDEF01',
      isAccountReady: true,
      error: null,
    })

    renderHook(() => useOwnedDomains())

    expect(
      domainsQueryMock.getAllDomainsInfiniteQuery,
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          owner_in: ['0xabcdef0123456789abcdef0123456789abcdef01'],
        },
      }),
    )
  })
})
