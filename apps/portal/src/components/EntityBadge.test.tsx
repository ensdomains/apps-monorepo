import { render, screen } from '@testing-library/react'
import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    className,
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
    className?: string
  }) => (
    <a
      href={to}
      data-params={JSON.stringify(params)}
      className={className}
      data-testid="router-link"
    >
      {children}
    </a>
  ),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: false }),
}))

vi.mock('wagmi', () => ({
  useChainId: () => 1,
}))

vi.mock('@/features/profile/components/NameAvatar', () => ({
  NameAvatar: () => <span data-testid="avatar" />,
}))

vi.mock('@/hooks/useSupportsInterfaces', () => ({
  getSupportsInterfacesQueryOptions: () => ({
    queryKey: ['supports-interfaces-mock'],
    queryFn: async () => [false],
  }),
}))

vi.mock('@/utils/ens/ensContractNames', () => ({
  getEnsContractName: () => undefined,
}))

const { EntityBadge } = await import('./EntityBadge')

const TEST_ADDRESS = '0x1234567890123456789012345678901234567890' as Address
const TEST_TX_URL = 'https://etherscan.io/tx/0xabc'

describe('EntityBadge primary action', () => {
  it('renders an internal Link for variant="name"', () => {
    render(
      <EntityBadge variant="name" name="alice.eth">
        alice-content
      </EntityBadge>,
    )
    // Disambiguate from the hover-chip Link by matching the wrapped content.
    const primary = screen.getByText('alice-content').closest('a')
    expect(primary).toHaveAttribute('href', '/$name')
    expect(primary?.dataset.params).toBe(JSON.stringify({ name: 'alice.eth' }))
  })

  it('renders an internal Link for variant="address"', () => {
    render(
      <EntityBadge variant="address" address={TEST_ADDRESS}>
        addr-content
      </EntityBadge>,
    )
    const primary = screen.getByText('addr-content').closest('a')
    expect(primary).toHaveAttribute('href', '/addr/$addr')
    expect(primary?.dataset.params).toBe(JSON.stringify({ addr: TEST_ADDRESS }))
  })

  it('renders an external anchor for variant="tx" with etherscanHref', () => {
    render(
      <EntityBadge variant="tx" etherscanHref={TEST_TX_URL}>
        0xabc
      </EntityBadge>,
    )
    // Primary action is a real <a target=_blank>, not a button/navigate.
    // There are two anchors in the DOM (chip + primary). The primary wraps the
    // content span, so find by the wrapped text.
    const anchors = screen.getAllByRole('link')
    const primary = anchors.find((a) => a.textContent?.includes('0xabc'))
    expect(primary).toBeDefined()
    expect(primary).toHaveAttribute('href', TEST_TX_URL)
    expect(primary).toHaveAttribute('target', '_blank')
    expect(primary).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders an external anchor for variant="contract" with etherscanHref (non-resolver)', () => {
    render(
      <EntityBadge
        variant="contract"
        address={TEST_ADDRESS}
        etherscanHref={TEST_TX_URL}
      >
        0x12...
      </EntityBadge>,
    )
    const anchors = screen.getAllByRole('link')
    const primary = anchors.find((a) => a.textContent?.includes('0x12...'))
    expect(primary).toHaveAttribute('href', TEST_TX_URL)
    expect(primary).toHaveAttribute('target', '_blank')
  })

  it('renders no clickable primary wrapper when nothing is actionable', () => {
    render(
      <EntityBadge variant="tx" copyValue="0xabc">
        tx-content
      </EntityBadge>,
    )
    // The primary wrapper for an un-actionable badge is a plain <div>, so the
    // wrapped content has no anchor or button ancestor.
    const content = screen.getByText('tx-content')
    expect(content.closest('a')).toBeNull()
    expect(content.closest('button')).toBeNull()
  })

  it('variant="default" has a non-interactive primary wrapper and renders no links even with chip-eligible props', () => {
    render(
      <EntityBadge
        variant="default"
        name="alice.eth"
        address={TEST_ADDRESS}
        etherscanHref={TEST_TX_URL}
      >
        default-content
      </EntityBadge>,
    )
    const content = screen.getByText('default-content')
    expect(content.closest('a')).toBeNull()
    expect(content.closest('button')).toBeNull()
    // No name/address/etherscan chips for the default variant.
    expect(screen.queryByTestId('router-link')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('variant="default" shows a Copy chip on hover when copyValue is set', () => {
    render(
      <EntityBadge variant="default" copyValue="0xabc">
        default-with-copy
      </EntityBadge>,
    )
    // A single Copy chip in the overlay (no name/address/etherscan chips).
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toHaveTextContent('Copy')
  })
})
