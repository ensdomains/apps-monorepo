import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ProfileNamesChunk } from '../service/profileAddressNames'
import { useProfileAddressNames } from './useProfileAddressNames'

const ADDRESS = '0x0000000000000000000000000000000000000001'

/** A first chunk with more to read, so the list total is not yet exact. */
const CHUNK: ProfileNamesChunk = {
  names: [],
  hiddenCount: 0,
  nextCursor: 'next',
  totalCount: 60,
}

vi.mock('../service/profileAddressNames', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../service/profileAddressNames')>()),
  getProfileNamesInfiniteQueryOptions: ({ search }: { search: string }) => ({
    queryKey: ['names', search],
    queryFn: () => CHUNK,
    initialPageParam: undefined,
    getNextPageParam: () => undefined,
  }),
  getProfileNameCountsQueryOptions: () => ({
    queryKey: ['counts'],
    queryFn: () => ({ owned: 3, managed: 1000 }),
  }),
}))

const wrapper = ({ children }: { readonly children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
)

const managedTotal = async (search: string) => {
  const { result } = renderHook(
    () =>
      useProfileAddressNames({
        address: ADDRESS,
        scope: 'managed',
        sortField: 'name',
        sortDir: 'asc',
        search,
        page: 1,
      }),
    { wrapper },
  )
  // Both reads are in once the owned chip shows bigname's count.
  await waitFor(() => {
    expect(result.current.isPending).toBe(false)
    expect(result.current.counts.owned).toBe(3)
  })
  return result.current.total
}

describe('useProfileAddressNames', () => {
  it("totals an unsearched managed list by bigname's managed count", async () => {
    expect(await managedTotal('')).toBe(1000)
  })

  it('totals a searched managed list by its own matches', async () => {
    expect(await managedTotal('ali')).toBe(60)
  })
})
