import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { V2NameWithRoles } from '@/utils/names/mergeNamesData'
import { YourNames } from './YourNames'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}))

vi.mock('@/features/profile/components/NameAvatar', () => ({
  NameAvatar: () => <span data-testid="avatar" />,
}))

vi.mock('@/components/SettingsMenu', () => ({ SettingsMenu: () => null }))
vi.mock('@/components/WalletMenu', () => ({ WalletMenu: () => null }))

const v2Ref = vi.hoisted(() => ({
  current: [] as V2NameWithRoles[] | Error,
}))

vi.mock('../hooks/useV1NamesForAddress', () => ({
  getV1NamesForAddressQueryOptions: () => ({
    queryKey: ['v1-names-mock'],
    queryFn: async () => [],
  }),
}))

vi.mock('../hooks/useV2NamesWithRolesForAddress', () => ({
  getV2NamesWithRolesForAddressQueryOptions: () => ({
    queryKey: ['v2-names-mock'],
    queryFn: async () => {
      if (v2Ref.current instanceof Error) throw v2Ref.current
      return v2Ref.current
    },
  }),
}))

const DAY = 24 * 60 * 60

const v2Name = (name: string, daysLeft: number): V2NameWithRoles => ({
  name,
  expiryDate: Math.floor(Date.now() / 1000) + daysLeft * DAY,
  roleBitmap: '0x1',
  subdomainCount: 0,
  recordCount: 0,
})

const renderNames = (names: V2NameWithRoles[] | Error) => {
  v2Ref.current = names
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <YourNames address="0x0000000000000000000000000000000000000001" />
    </QueryClientProvider>,
  )
}

describe('YourNames', () => {
  it('warns about names expiring within 30 days, soonest first', async () => {
    renderNames([v2Name('later.eth', 800), v2Name('soon.eth', 4)])

    const rows = await screen.findAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('soon.eth')
    expect(within(rows[0]).getByText('Expires in 4 days')).toHaveClass(
      'bg-message-warning-fill',
    )
    expect(within(rows[1]).getByText(/^Expires in 2 years/)).not.toHaveClass(
      'bg-message-warning-fill',
    )
  })

  it('shows four names, then reveals more on demand', async () => {
    renderNames(
      Array.from({ length: 6 }, (_, i) => v2Name(`name${i}.eth`, 100 + i)),
    )

    const showMore = await screen.findByRole('button', {
      name: 'Show more (6 total)',
    })
    expect(screen.getAllByText(/^name\d\.eth$/)).toHaveLength(4)

    fireEvent.click(showMore)
    expect(screen.getAllByText(/^name\d\.eth$/)).toHaveLength(6)
    expect(screen.queryByRole('button', { name: /Show more/ })).toBeNull()
  })

  it('says so when the wallet holds no names', async () => {
    renderNames([])
    expect(await screen.findByText('No names yet')).toBeInTheDocument()
  })

  it('shows an error instead of an empty list when a query fails', async () => {
    renderNames(new Error('indexer down'))
    expect(
      await screen.findByText(/Error fetching your names/),
    ).toBeInTheDocument()
    expect(screen.queryByText('No names yet')).toBeNull()
  })
})
