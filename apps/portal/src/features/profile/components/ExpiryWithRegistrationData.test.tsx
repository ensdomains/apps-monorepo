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
}

vi.mock('../hooks/useRegistrationData', () => ({
  getRegistrationDataQueryOptions: ({ name }: { name: string }) => ({
    queryKey: ['registrationData', name],
    queryFn: () => ({
      createdAt: null,
      registeredAt: REGISTERED_AT,
      expiry: EXPIRIES[name] ?? null,
      graceEnd: null,
    }),
  }),
  getRegistrationTxQueryOptions: () => ({
    queryKey: ['registrationTx'],
    queryFn: () => null,
  }),
}))

vi.mock('@/utils/blockExplorer/useBlockExplorerUrl', () => ({
  useBlockExplorerTxUrl: () => undefined,
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
  it('shows when a subname stops resolving with a parent that expires first', async () => {
    renderExpiry('beep.parent.eth')

    expect(await screen.findByText('Stops resolving')).toBeInTheDocument()
    expect(rowText('Expires')).toMatch(/2034/)
    expect(rowText('Stops resolving')).toMatch(/2030/)
  })

  it('shows when a subname with no expiry of its own stops resolving', async () => {
    renderExpiry('right.parent.eth')

    expect(await screen.findByText('Stops resolving')).toBeInTheDocument()
    expect(rowText('Stops resolving')).toMatch(/2030/)
    expect(screen.queryByText('Expires')).toBeNull()
  })

  it('leaves an ENSv1 subname, which outlives its parent’s lease, without the row', async () => {
    renderExpiry('v1.parent.eth', 'ENSv1')

    expect(await screen.findByText('Registered')).toBeInTheDocument()
    expect(screen.queryByText('Stops resolving')).toBeNull()
  })
})
