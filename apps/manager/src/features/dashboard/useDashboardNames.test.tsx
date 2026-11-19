import {
  infiniteQueryOptions,
  QueryClient,
  QueryClientProvider,
  queryOptions,
} from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import type { DashboardName } from './dashboardNames'
import { useDashboardNames } from './useDashboardNames'

const ACCOUNT = '0x0000000000000000000000000000000000000001'
const reads = vi.hoisted(() => vi.fn())
vi.mock('wagmi', () => ({
  useConnection: () => ({
    address: '0x0000000000000000000000000000000000000001',
  }),
}))
vi.mock('@/lib/smart-account/SmartAccountContext', () => ({
  useSmartAccountContextSafe: () => null,
}))
vi.mock('./service/queries/getDashboardNames', () => ({
  DASHBOARD_PAGE_SIZE: 25,
  getDashboardGraceNamesQueryOptions: () =>
    queryOptions({ queryKey: ['grace'], queryFn: () => [] }),
  getDashboardNamesInfiniteQueryOptions: () =>
    infiniteQueryOptions({
      queryKey: ['names'],
      initialPageParam: 0,
      queryFn: ({ pageParam }) => {
        reads(pageParam)
        const names: readonly DashboardName[] = Array.from(
          { length: 50 },
          (_, index) => {
            const name = `name${String(pageParam * 50 + index).padStart(3, '0')}.eth`
            return {
              name,
              key: `0x${(pageParam * 50 + index).toString(16)}` as const,
              protocol: 'v2',
              expiryDate: 0n,
              servedExpiry: null,
              graceEndsAt: null,
              createdAt: 0n,
              nameRoles: ['owner'],
              isLapsed: false,
            }
          },
        )
        return [
          {
            address: ACCOUNT,
            names,
            lastRead: names.at(-1) ?? null,
            hiddenCount: 0,
            nextCursor: pageParam < 2 ? String(pageParam + 1) : null,
            totalCount: 150,
          },
        ]
      },
      getNextPageParam: (_last, _pages, lastParam) =>
        lastParam < 2 ? lastParam + 1 : undefined,
    }),
}))

const setup = (page: number) => {
  reads.mockClear()
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(({ page }) => useDashboardNames({ page }), {
    wrapper,
    initialProps: { page },
  })
}

it('loads a linked page across multiple indexer chunks, then reuses them to go back', async () => {
  const { result, rerender } = setup(6)
  await waitFor(() => {
    expect(result.current.isPagePending).toBe(false)
    expect(result.current.pageNames[0]?.name).toBe('name125.eth')
  })
  expect(result.current.pageNames.at(-1)?.name).toBe('name149.eth')
  expect(reads.mock.calls.map(([cursor]) => cursor)).toEqual([0, 1, 2])

  rerender({ page: 1 })
  expect(result.current.pageNames[0]?.name).toBe('name000.eth')
  expect(reads).toHaveBeenCalledTimes(3)
})
