import type { NameSummary, ReadNamesForAddress } from '@ens-apps/indexer/reads'
import { IndexerReadError } from '@ens-apps/indexer/reads'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { errAsync, okAsync } from 'neverthrow'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { usePrimaryNameDomains } from './usePrimaryNameDomains'

const readNames = vi.hoisted(() => vi.fn<ReadNamesForAddress>())

vi.mock('@/lib/bigname', () => ({ bigname: {} }))
vi.mock('@/lib/wagmi', () => ({ publicClient: {} }))
vi.mock('@ens-apps/indexer/bigname', () => ({
  readNamesForAddress: () => readNames,
}))
vi.mock('@/features/profile/service/primaryNameForwardAddress', () => ({
  primaryNameForwardAddressQuery: (_client: unknown, name: string) => ({
    queryKey: ['forward', name],
    queryFn: async () => OWNER,
  }),
}))

const ADDRESS = '0x0000000000000000000000000000000000000abc'
const OWNER = '0x0000000000000000000000000000000000000def'

const owned = (name: string): NameSummary => ({
  name,
  displayName: name,
  namehash: `0x${name.length}`,
  protocol: 'v2',
  relations: ['owner'],
  isPrimary: false,
  isMigrated: false,
  registrationStatus: 'active',
  expiresAt: null,
  servedExpiry: null,
  graceEndsAt: null,
  registeredAt: null,
  createdAt: null,
})

const wrapper = ({ children }: { readonly children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
)

describe('usePrimaryNameDomains', () => {
  it('lists owned names when the resolving-names read fails, without retrying it', async () => {
    readNames.mockImplementation((query) =>
      query.resolvesTo
        ? errAsync(
            new IndexerReadError({
              message: 'unavailable',
              kind: 'unavailable',
              cause: new Error('down'),
            }),
          )
        : okAsync({
            items: [owned('alice.eth')],
            nextCursor: null,
            totalCount: null,
          }),
    )

    const { result } = renderHook(
      () =>
        usePrimaryNameDomains({
          address: ADDRESS,
          ownerAddress: OWNER,
          open: true,
          reverseName: null,
          selectedName: null,
        }),
      { wrapper },
    )

    await waitFor(() =>
      expect(result.current.hasResolvingNamesError).toBe(true),
    )
    await waitFor(() =>
      expect(result.current.domains.map(({ name }) => name)).toEqual([
        'alice.eth',
      ]),
    )
    expect(result.current.hasForwardAddressError).toBe(false)
    expect(
      readNames.mock.calls.filter(([query]) => query.resolvesTo),
    ).toHaveLength(1)
  })
})
