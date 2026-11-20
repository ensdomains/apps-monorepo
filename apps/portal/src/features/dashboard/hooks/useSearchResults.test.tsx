import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSearchResults } from './useSearchResults'

const reads = vi.hoisted(() => ({
  owner: vi.fn(),
  availability: vi.fn(),
  profile: vi.fn(),
  interfaces: vi.fn(),
  portfolio: vi.fn(),
  tlds: vi.fn(),
}))

const WALLET_ADDRESS = '0x0000000000000000000000000000000000000001'

vi.mock('wagmi', () => ({
  useConnection: () => ({
    address: '0x0000000000000000000000000000000000000001',
  }),
}))
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))
vi.mock('./useSuggestionTlds', () => ({
  useSuggestionTlds: (enabled: boolean) => {
    reads.tlds(enabled)
    return { validTlds: ['eth'], isLoading: false }
  },
}))
vi.mock('@/features/profile/hooks/useEnsOwner', () => ({
  getEnsOwnerQueryOptions: ({ name }: { readonly name: string }) => ({
    queryKey: ['search-owner', { name }],
    queryFn: () => reads.owner(name),
  }),
}))
vi.mock('@/features/profile/hooks/useNameAvailability', () => ({
  getNameAvailabilityQueryOptions: ({ name }: { readonly name: string }) => ({
    queryKey: ['search-availability', { name }],
    queryFn: () => reads.availability(name),
  }),
}))
vi.mock('@/features/profile/hooks/useProfile', () => ({
  getProfileQueryOptions: ({
    name,
    includeLegacyRecords,
  }: {
    readonly name: string
    readonly includeLegacyRecords?: boolean
  }) => ({
    queryKey: ['search-profile', { name, includeLegacyRecords }],
    queryFn: () => reads.profile(name, includeLegacyRecords),
  }),
}))
vi.mock('@/hooks/useSupportsInterfaces', () => ({
  getSupportsInterfacesQueryOptions: ({
    address,
  }: {
    readonly address: string
  }) => ({
    queryKey: ['search-interfaces', { address }],
    queryFn: () => reads.interfaces(address),
  }),
}))
vi.mock('./useAddressNames', () => ({
  getAddressNamesQueryOptions: ({ address }: { readonly address: string }) => ({
    queryKey: ['search-portfolio', { address }],
    queryFn: () => reads.portfolio(address),
  }),
}))

const makeWrapper = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return {
    client,
    wrapper: ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  }
}

const navigation = {
  navigateToName: vi.fn(),
  navigateToAddress: vi.fn(),
  navigateToResolver: vi.fn(),
}

describe('useSearchResults', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    reads.owner.mockResolvedValue(null)
    reads.availability.mockResolvedValue({ isAvailable: false })
    reads.profile.mockResolvedValue({ records: { texts: [], coins: [] } })
    reads.interfaces.mockResolvedValue([])
    reads.portfolio.mockResolvedValue([])
  })

  it('uses cached personal names without starting reads when disabled', () => {
    const { client, wrapper } = makeWrapper()
    client.setQueryData(
      ['search-portfolio', { address: WALLET_ADDRESS }],
      [{ name: 'foxglove.eth', relations: ['owner'] }],
    )
    const { result } = renderHook(
      () =>
        useSearchResults({
          ...navigation,
          searchValue: 'fox',
          enabled: false,
          fetchOwnedNames: false,
        }),
      { wrapper },
    )

    expect(result.current.ownedNamesFiltered).toEqual([
      { name: 'foxglove.eth', relations: ['owner'] },
    ])
    expect(reads.owner).not.toHaveBeenCalled()
    expect(reads.availability).not.toHaveBeenCalled()
    expect(reads.profile).not.toHaveBeenCalled()
    expect(reads.interfaces).not.toHaveBeenCalled()
    expect(reads.portfolio).not.toHaveBeenCalled()
    expect(reads.tlds).toHaveBeenLastCalledWith(false)
  })

  it('can search an explicit name without fetching a cold portfolio', async () => {
    const { wrapper } = makeWrapper()
    renderHook(
      () =>
        useSearchResults({
          ...navigation,
          searchValue: 'fox.eth',
          fetchOwnedNames: false,
        }),
      { wrapper },
    )

    await waitFor(() =>
      expect(reads.availability).toHaveBeenCalledWith('fox.eth'),
    )
    expect(reads.owner).toHaveBeenCalledWith('fox.eth')
    expect(reads.portfolio).not.toHaveBeenCalled()
    expect(reads.tlds).toHaveBeenLastCalledWith(true)
  })

  it('can load a bounded personal-name section for an empty target picker', async () => {
    reads.portfolio.mockResolvedValue([
      { name: 'fox.eth', relations: ['owner'] },
      { name: 'other.eth', relations: ['manager'] },
    ])
    const { wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSearchResults({
          ...navigation,
          searchValue: '',
          enabled: false,
          fetchOwnedNames: true,
        }),
      { wrapper },
    )

    await waitFor(() =>
      expect(result.current.ownedNameSuggestions).toEqual([
        { name: 'fox.eth' },
      ]),
    )
    expect(result.current.ownedNamesFiltered).toEqual([])
    expect(reads.owner).not.toHaveBeenCalled()
    expect(reads.availability).not.toHaveBeenCalled()
  })

  it('bounds verification without blocking current candidates or marking unchecked alternatives as pending', async () => {
    const { wrapper } = makeWrapper()
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useSearchResults({
          ...navigation,
          searchValue: 'fox',
          enabled,
          fetchOwnedNames: false,
          suggestionTlds: ['eth', 'xyz'],
          verificationLimit: 1,
        }),
      { wrapper, initialProps: { enabled: false } },
    )
    expect(
      result.current.suggestions.map(({ inputValue }) => inputValue),
    ).toEqual(['fox.eth', 'fox.xyz'])
    expect(reads.owner).not.toHaveBeenCalled()
    rerender({ enabled: true })
    await waitFor(() =>
      expect(
        result.current.nameVerificationBySuggestionId.get('name:fox.eth'),
      ).toEqual({ status: 'unchecked' }),
    )
    expect(reads.owner.mock.calls).toEqual([['fox.eth']])
    expect(reads.availability.mock.calls).toEqual([['fox.eth']])
    expect(
      result.current.nameVerificationBySuggestionId.get('name:fox.xyz'),
    ).toEqual({ status: 'unchecked' })
    expect(reads.tlds).toHaveBeenLastCalledWith(false)
  })

  it('defers DNS record verification while preserving the exact candidate', () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSearchResults({
          ...navigation,
          searchValue: 'helgesson.com',
          suggestionMode: 'focused',
          verificationMode: 'discovery',
          shouldDeferDnsVerification: true,
          fetchOwnedNames: false,
        }),
      { wrapper },
    )
    expect(
      result.current.suggestions.map(({ inputValue }) => inputValue),
    ).toEqual(['helgesson.com'])
    expect(
      result.current.nameVerificationBySuggestionId.get('name:helgesson.com'),
    ).toEqual({ status: 'unchecked' })
    expect(reads.profile).not.toHaveBeenCalled()
    expect(reads.owner).not.toHaveBeenCalled()
  })

  it('can check availability without querying ownership or full profile records', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSearchResults({
          ...navigation,
          searchValue: 'helgesson.eth',
          fetchOwnedNames: false,
          suggestionTlds: ['eth'],
          verificationLimit: 1,
          verificationMode: 'availability-only',
        }),
      { wrapper },
    )
    await waitFor(() =>
      expect(result.current.pendingAvailabilityIds.size).toBe(0),
    )
    expect(reads.availability).toHaveBeenCalledExactlyOnceWith('helgesson.eth')
    expect(reads.owner).not.toHaveBeenCalled()
    expect(reads.profile).not.toHaveBeenCalled()
    expect(
      result.current.nameVerificationBySuggestionId.get('name:helgesson.eth'),
    ).toEqual({ status: 'unchecked' })
  })

  it('reuses fresh availability results when reopening an availability-only search', async () => {
    const { wrapper } = makeWrapper()
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useSearchResults({
          ...navigation,
          searchValue: 'helgesson.eth',
          enabled,
          fetchOwnedNames: false,
          suggestionTlds: ['eth'],
          verificationLimit: 1,
          verificationMode: 'availability-only',
          queryStaleTime: 60_000,
        }),
      { wrapper, initialProps: { enabled: true } },
    )
    await waitFor(() =>
      expect(result.current.pendingAvailabilityIds.size).toBe(0),
    )
    rerender({ enabled: false })
    rerender({ enabled: true })
    expect(reads.availability).toHaveBeenCalledExactlyOnceWith('helgesson.eth')
  })

  it.each([
    [
      { texts: [{ key: 'url', value: 'https://example.com' }], coins: [] },
      'resolved',
    ],
    [{ texts: [], coins: [] }, 'not-found'],
  ] as const)(
    'verifies explicit DNS usability without a registration or ownership check',
    async (records, status) => {
      reads.profile.mockResolvedValue({ records })
      const { wrapper } = makeWrapper()
      const { result } = renderHook(
        () =>
          useSearchResults({
            ...navigation,
            searchValue: 'helgesson.com',
            fetchOwnedNames: false,
            suggestionMode: 'focused',
            verificationMode: 'discovery',
            verificationLimit: 1,
          }),
        { wrapper },
      )
      await waitFor(() =>
        expect(
          result.current.nameVerificationBySuggestionId.get(
            'name:helgesson.com',
          ),
        ).toEqual({ status }),
      )
      expect(
        result.current.suggestions.map(({ inputValue }) => inputValue),
      ).toEqual(['helgesson.com'])
      expect(reads.profile).toHaveBeenCalledExactlyOnceWith(
        'helgesson.com',
        false,
      )
      expect(reads.owner).not.toHaveBeenCalled()
      expect(reads.availability).not.toHaveBeenCalled()
      expect(reads.tlds).toHaveBeenLastCalledWith(false)
    },
  )

  it('does not turn a failed owner lookup into an absent name', async () => {
    reads.owner.mockRejectedValue(new Error('RPC unavailable'))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSearchResults({
          ...navigation,
          searchValue: 'child.fox.eth',
          fetchOwnedNames: false,
        }),
      { wrapper },
    )

    await waitFor(() =>
      expect(
        result.current.nameVerificationBySuggestionId.get('name:child.fox.eth'),
      ).toEqual({ status: 'failed', source: 'owner' }),
    )
    expect(
      result.current.ownerBySuggestionId.get('name:child.fox.eth'),
    ).toBeUndefined()
    expect(result.current.offchainNameIds.has('name:child.fox.eth')).toBe(false)
    expect(reads.profile).not.toHaveBeenCalled()
  })
})
