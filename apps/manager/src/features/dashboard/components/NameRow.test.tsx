import type { AnchorHTMLAttributes } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import { NameRow } from './NameRow'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}))

describe('NameRow', () => {
  it('places grace period badge on the right side of the top row', () => {
    const { getByText } = render(
      <NameRow isInGrace label="expires-in-30-days.eth" nameRole="owner" />,
    )

    const graceBadge = getByText('Grace period').closest('span')
    const ownerBadge = getByText('Owner').closest('span')
    const topRow = graceBadge?.parentElement

    expect(topRow?.firstElementChild).toContainElement(ownerBadge)
    expect(topRow?.firstElementChild).not.toContainElement(graceBadge)
    expect(topRow?.lastElementChild).toBe(graceBadge)
  })

  it('links the manage explorer CTA to the ENS explorer app', () => {
    const { getByText } = render(
      <NameRow cta="manageExplorer" label="fgeorgescu.eth" />,
    )

    const link = getByText('Manage on explorer').closest('a')

    expect(link).toHaveAttribute(
      'href',
      'https://sepolia.explorer.ens.domains/fgeorgescu.eth',
    )
  })

  it('renders each supplied name role', () => {
    const { getByText } = render(
      <NameRow label="wrapped.eth" nameRoles={['owner', 'manager']} />,
    )

    expect(getByText('Owner')).toBeInTheDocument()
    expect(getByText('Manager')).toBeInTheDocument()
  })

  it('places the primary badge before status and role pills', () => {
    const { getByText } = render(
      <NameRow
        label="wrapped.eth"
        nameRoles={['owner', 'manager']}
        status="eligibleUpgrade"
        verified
      />,
    )

    const primaryBadge = getByText('Primary Name').parentElement
    const leftTags = primaryBadge?.parentElement

    expect(leftTags?.firstElementChild).toBe(primaryBadge)
    expect(Array.from(leftTags?.children ?? [])).toEqual([
      primaryBadge,
      getByText('Eligible for upgrade').closest('span'),
      getByText('Owner').closest('span'),
      getByText('Manager').closest('span'),
    ])
  })

  it('uses the same visual tone for owner and manager roles', () => {
    const { getByText } = render(
      <NameRow label="wrapped.eth" nameRoles={['owner', 'manager']} />,
    )

    const ownerBadge = getByText('Owner').closest('span')
    const managerBadge = getByText('Manager').closest('span')

    expect(managerBadge).toHaveClass(ownerBadge?.className ?? '')
  })

  it('shows when a name in grace expired, and under it when grace ends', () => {
    const { getByText } = render(
      <NameRow
        expiryLabel="August 29, 2026"
        graceEndLabel="November 27, 2026"
        isInGrace
        label="banana.eth"
      />,
    )

    expect(getByText('Expires on').nextElementSibling).toHaveTextContent(
      'August 29, 2026',
    )
    expect(getByText('Grace period ends').nextElementSibling).toHaveTextContent(
      'November 27, 2026',
    )
  })

  it('shows non-expiring names without the expires-on prefix', () => {
    const { getByText, queryByText } = render(
      <NameRow expiryLabel="Does not expire" label="pokemon.fgeorgescu.eth" />,
    )

    expect(getByText('Does not expire')).toBeInTheDocument()
    expect(queryByText('Expires on')).not.toBeInTheDocument()
  })

  it('does not render the renew menu item when the name cannot be renewed', () => {
    const { queryByText } = render(
      <NameRow canRenew={false} label="pokemon.fgeorgescu.eth" />,
    )

    expect(queryByText('Renew name')).not.toBeInTheDocument()
  })
})
