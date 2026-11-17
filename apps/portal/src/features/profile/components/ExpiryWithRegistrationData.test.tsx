import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createTestQueryClient } from '@/test-utils/providers'
import { ExpiryWithRegistrationData } from './ExpiryWithRegistrationData'

const PARENT_EXPIRY = Date.UTC(2030, 5, 15) / 1000
const OWN_EXPIRY = Date.UTC(2034, 10, 4) / 1000
const REGISTERED_AT = Date.UTC(2026, 10, 4) / 1000

/** Unix-second expiries by name; null never expires. */
const EXPIRIES: Readonly<Record<string, number | null>> = {
  'parent.eth': PARENT_EXPIRY,
  'beep.parent.eth': OWN_EXPIRY,
  'right.parent.eth': null,
  'v1.parent.eth': null,
  'sub.unread.eth': null,
}

vi.mock('../hooks/useRegistrationData', () => ({
  getRegistrationDataQueryOptions: ({ name }: { name: string }) => ({
    queryKey: ['registrationData', name],
    queryFn: () => {
      if (name === 'unread.eth') throw new Error('read failed')
      return {
        createdAt: null,
        registeredAt: REGISTERED_AT,
        expiry: EXPIRIES[name] ?? null,
        graceEnd: null,
      }
    },
  }),
  getRegistrationTxQueryOptions: () => ({
    queryKey: ['registrationTx'],
    queryFn: () => null,
  }),
}))

vi.mock('@/utils/blockExplorer/useBlockExplorerUrl', () => ({
  useBlockExplorerTxUrl: () => undefined,
}))

vi.mock('@/components/EntityBadge', () => ({
  EntityBadge: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
}))

vi.mock('../hooks/useGraceStatus', () => ({
  useGraceStatus: () => ({ isInGrace: false, graceEndDate: null }),
}))

const rowText = (label: string) =>
  screen.getByText(label).parentElement?.parentElement?.textContent ?? ''

const renderExpiry = (
  name: string,
  protocolVersion: 'ENSv1' | 'ENSv2' = 'ENSv2',
) =>
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ExpiryWithRegistrationData
        name={name}
        protocolVersion={protocolVersion}
      />
    </QueryClientProvider>,
  )

describe('ExpiryWithRegistrationData', () => {
  it('shows the parent’s date, naming it, when it comes before the subname’s own', async () => {
    renderExpiry('beep.parent.eth')

    expect(await screen.findByText('Expires')).toBeInTheDocument()
    expect(rowText('Expires')).toMatch(/2030.* · Expires with parent\.eth$/)
    expect(rowText('Expires')).not.toMatch(/2034/)
  })

  it('shows the parent’s date for a subname with no expiry of its own', async () => {
    renderExpiry('right.parent.eth')

    expect(await screen.findByText('Expires')).toBeInTheDocument()
    expect(rowText('Expires')).toMatch(/2030.* · Expires with parent\.eth$/)
  })

  it('shows a name’s own expiry alone when no name above sets it', async () => {
    renderExpiry('parent.eth')

    expect(await screen.findByText('Expires')).toBeInTheDocument()
    expect(rowText('Expires')).toMatch(/2030/)
    expect(rowText('Expires')).not.toMatch(/Expires with/)
  })

  it('says the subname expires with its parent when a name above couldn’t be read', async () => {
    renderExpiry('sub.unread.eth')

    expect(await screen.findByText('Expires')).toBeInTheDocument()
    expect(rowText('Expires')).toMatch(/Expires with parent$/)
  })

  it('leaves an ENSv1 subname, which outlives its parent’s lease, without the row', async () => {
    renderExpiry('v1.parent.eth', 'ENSv1')

    expect(await screen.findByText('Registered')).toBeInTheDocument()
    expect(screen.queryByText('Expires')).toBeNull()
  })
})
