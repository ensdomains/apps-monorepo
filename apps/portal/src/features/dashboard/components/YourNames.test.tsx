import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  type AddressNameItem,
  mergeAddressNames,
} from '@/utils/names/addressNames'
import { YourNames } from './YourNames'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}))

vi.mock('@/features/profile/components/NameAvatar', () => ({
  NameAvatar: () => <span data-testid="avatar" />,
}))

vi.mock('@/components/SettingsMenu', () => ({ SettingsMenu: () => null }))
vi.mock('@/components/WalletMenu', () => ({ WalletMenu: () => null }))

const namesRef = vi.hoisted(() => ({
  current: [] as readonly AddressNameItem[] | Error,
}))

// The real merge orders the names, as the read does.
vi.mock('../hooks/useAddressNames', () => ({
  getAddressNamesQueryOptions: () => ({
    queryKey: ['address-names-mock'],
    queryFn: async () => {
      if (namesRef.current instanceof Error) throw namesRef.current
      return mergeAddressNames(namesRef.current, [])
    },
  }),
}))

const DAY = 24n * 60n * 60n

const item = (name: string, expiryDate: Date): AddressNameItem => ({
  name,
  expiryDate,
  relations: ['owner'],
  protocolVersion: 'ENSv2',
})

const v2Name = (name: string, daysLeft: bigint): AddressNameItem =>
  item(
    name,
    new Date(
      Number(BigInt(Math.floor(Date.now() / 1000)) + daysLeft * DAY) * 1000,
    ),
  )

const renderNames = (names: readonly AddressNameItem[] | Error) => {
  namesRef.current = names
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
    renderNames([v2Name('later.eth', 800n), v2Name('soon.eth', 4n)])

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
      Array.from({ length: 6 }, (_, i) =>
        v2Name(`name${i}.eth`, 100n + BigInt(i)),
      ),
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

  it('shows an error instead of an empty list when the read fails', async () => {
    renderNames(new Error('bigname down'))
    expect(await screen.findByText(/Error fetching names/)).toBeInTheDocument()
    expect(screen.queryByText('No names yet')).toBeNull()
  })

  it('orders granted subnames by expiry with the rest, so their warning shows', async () => {
    renderNames([
      ...Array.from({ length: 4 }, (_, i) =>
        v2Name(`held${i}.eth`, 500n + BigInt(i)),
      ),
      v2Name('granted.parent.eth', 10n),
    ])

    const rows = await screen.findAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('granted.parent.eth')
    expect(within(rows[0]).getByText('Expires in 10 days')).toHaveClass(
      'bg-message-warning-fill',
    )
  })

  it('does not claim the wallet is empty while a query is paused offline', async () => {
    onlineManager.setOnline(false)
    try {
      renderNames([])
      expect(await screen.findByText('Loading your names')).toBeInTheDocument()
      expect(screen.queryByText('No names yet')).toBeNull()
    } finally {
      onlineManager.setOnline(true)
    }
  })

  it('truncates a long name so the expiry keeps its column', async () => {
    const encoded =
      '[ba9d5b944633af135d2899dce4c44a43b00ed78f640ff4bc2088401760432cdc].eth'
    renderNames([v2Name(encoded, 271n)])

    expect(await screen.findByText('[ba9d5b944…60432cdc].eth')).toHaveAttribute(
      'title',
      encoded,
    )
    expect(screen.queryByText(encoded)).toBeNull()
    expect(screen.getByText('Expires in 271 days')).toHaveClass(
      'whitespace-nowrap',
    )
  })

  // Expiry 2026-06-03T12:00Z seen at 2026-06-02T11:30Z from UTC+13, where the
  // local day has already rolled over to 06-03 while the name has 24h left.
  it('counts down against the UTC day, not the viewer’s local day', async () => {
    const plainDateISO = vi
      .spyOn(Temporal.Now, 'plainDateISO')
      .mockImplementation((timeZone) =>
        Temporal.PlainDate.from(
          timeZone === 'UTC' ? '2026-06-02' : '2026-06-03',
        ),
      )
    renderNames([item('utc.eth', new Date(Date.UTC(2026, 5, 3, 12)))])

    expect(await screen.findByText('Expires in 1 day')).toBeInTheDocument()
    expect(screen.queryByText('Expired')).toBeNull()
    plainDateISO.mockRestore()
  })
})
