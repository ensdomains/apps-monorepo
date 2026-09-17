import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let routeName = 'jobintime.xyz'
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useParams: () => ({ name: routeName }),
  }),
  // The history timeline's dashboard cards are wrapped at import time.
  createLink: (component: unknown) => component,
}))

vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi')>()
  return { ...actual, useConnection: () => ({ address: undefined }) }
})

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    // No registry entry: the owner lookup settles on null, and availability
    // (a .eth-only query) has nothing to add.
    useQuery: () => ({ data: null, error: null, isLoading: false }),
  }
})
vi.mock('@/features/profile/hooks/useGraceStatus', () => ({
  useGraceStatus: () => ({
    isInGrace: false,
    isExpired: false,
    graceEndDate: null,
    isLoading: false,
    error: null,
  }),
}))
vi.mock('@/features/renew/hooks/useCanExtend', () => ({
  useCanExtend: () => ({ canExtend: false }),
}))
vi.mock('@/features/transfer/hooks/useCanTransferName', () => ({
  useCanTransferName: () => ({ canTransfer: false }),
}))
vi.mock('@/features/dns-import/components/DnsClaimableMessage', () => ({
  DnsClaimableMessage: ({ name }: { name: string }) => (
    <div data-testid="dns-claimable" data-name={name} />
  ),
}))

// `Route` is the mocked options object (see createFileRoute above).
const { Route } = await import('./index')
const OwnershipRoute = (
  Route as unknown as { component: () => React.ReactElement }
).component

beforeEach(() => {
  routeName = 'jobintime.xyz'
})

describe('ownership route', () => {
  // A null owner is no verdict on a DNS name: it may be live off-chain.
  it('hands an ownerless DNS name to the DNS message', () => {
    render(<OwnershipRoute />)

    expect(screen.getByTestId('dns-claimable')).toHaveAttribute(
      'data-name',
      'jobintime.xyz',
    )
    expect(screen.queryByText('Name not registered')).not.toBeInTheDocument()
  })

  it('still reports an ownerless .eth name as not registered', () => {
    routeName = 'nobody.eth'

    render(<OwnershipRoute />)

    expect(screen.getByText('Name not registered')).toBeInTheDocument()
    expect(screen.queryByTestId('dns-claimable')).not.toBeInTheDocument()
  })
})
