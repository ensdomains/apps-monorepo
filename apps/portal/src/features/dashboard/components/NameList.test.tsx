import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { V2NameWithRoles } from '@/utils/names/mergeNamesData'
import { NameList } from './NameList'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}))

vi.mock('@/features/profile/components/NameAvatar', () => ({
  NameAvatar: () => <span data-testid="avatar" />,
}))

const ADDRESS = '0x0000000000000000000000000000000000000001'
const PAGE_SIZE = 100
const TOTAL = 150

const v2Name = (index: number): V2NameWithRoles => ({
  name: `name${index}.eth`,
  // V2NameWithRoles carries the indexer's number-typed expiry.
  expiryDate: Number(2_000_000_000n + BigInt(index)),
  roleBitmap: '0x1',
  subdomainCount: 0,
})

const v1Options = {
  queryKey: createQueryKey('v1-names-mock')(),
  queryFn: () => ({ names: [], hasNextPage: false }),
  initialPageParam: undefined,
  getNextPageParam: () => undefined,
}

const v2Options = {
  queryKey: createQueryKey('v2-names-mock')(),
  queryFn: ({ pageParam }: { readonly pageParam: number }) => ({
    names: Array.from(
      { length: Math.min(PAGE_SIZE, TOTAL - pageParam) },
      (_, i) => v2Name(pageParam + i),
    ),
    totalCount: TOTAL,
  }),
  initialPageParam: 0,
  getNextPageParam: (
    _last: unknown,
    pages: readonly { names: readonly unknown[] }[],
  ) => {
    const loaded = pages.reduce((sum, page) => sum + page.names.length, 0)
    return loaded < TOTAL ? loaded : undefined
  },
}

vi.mock('../hooks/useV1NamesForAddress', () => ({
  getV1NamesPagesForAddressQueryOptions: () => v1Options,
}))

vi.mock('../hooks/useV2NamesWithRolesForAddress', () => ({
  getV2NamesPagesForAddressQueryOptions: () => v2Options,
}))

const renderPreview = (queryClient: QueryClient) =>
  render(
    <QueryClientProvider client={queryClient}>
      <NameList address={ADDRESS} limit={3} />
    </QueryClientProvider>,
  )

const newClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })

describe('NameList full-list link', () => {
  it('leaves the count off while later pages are unloaded', async () => {
    renderPreview(newClient())

    const link = await screen.findByRole('link', { name: /Go to full list/ })
    expect(link).toHaveTextContent(/^Go to full list$/)
  })

  it('counts every page once the names page has loaded them all', async () => {
    const queryClient = newClient()
    await queryClient.prefetchInfiniteQuery({ ...v2Options, pages: 2 })

    renderPreview(queryClient)

    const link = await screen.findByRole('link', { name: /Go to full list/ })
    expect(link).toHaveTextContent(`Go to full list (${TOTAL})`)
  })
})
