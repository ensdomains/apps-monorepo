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

  it('shows non-expiring names without the expires-on prefix', () => {
    const { getByText, queryByText } = render(
      <NameRow expiryLabel="Does not expire" label="pokemon.fgeorgescu.eth" />,
    )

    expect(getByText('Does not expire')).toBeInTheDocument()
    expect(queryByText('Expires on')).not.toBeInTheDocument()
  })

  it.each([
    ['loaded', false],
    ['loading', true],
  ])(
    'marks a selected name with a single check while its avatar is %s',
    (_, avatarPending) => {
      const { container, getByRole } = render(
        <NameRow
          avatarPending={avatarPending}
          isSelected
          label="thanksv1rtl.eth"
          selectable
        />,
      )

      expect(
        getByRole('button', { name: 'Deselect thanksv1rtl.eth' }),
      ).toHaveAttribute('aria-pressed', 'true')
      expect(container.querySelectorAll('.lucide-check')).toHaveLength(1)
    },
  )

  it('states the expiry once, with the warning and the date, when the name expires soon', () => {
    const { container, getAllByText, getByText, queryByText } = render(
      <NameRow
        expiringInDays={18}
        expiryLabel="November 24, 2026"
        label="thanksv1rtl.eth"
      />,
    )

    expect(getAllByText(/Expires/)).toHaveLength(1)
    expect(getByText('Expires in 18 days')).toBeInTheDocument()
    expect(getByText('November 24, 2026')).toBeInTheDocument()
    expect(queryByText('Expires on')).not.toBeInTheDocument()
    expect(container.firstElementChild?.childElementCount).toBe(2)
  })

  it('keeps the grace period badge instead of the expiry warning for a name in grace', () => {
    const { getByText, queryByText } = render(
      <NameRow
        expiringInDays={18}
        expiryLabel="November 24, 2026"
        isInGrace
        label="thanksv1rtl.eth"
      />,
    )

    expect(getByText('Grace period')).toBeInTheDocument()
    expect(getByText('Expires on')).toBeInTheDocument()
    expect(queryByText('Expires in 18 days')).not.toBeInTheDocument()
  })

  it('does not render the renew menu item when the name cannot be renewed', () => {
    const { queryByText } = render(
      <NameRow canRenew={false} label="pokemon.fgeorgescu.eth" />,
    )

    expect(queryByText('Renew name')).not.toBeInTheDocument()
  })
})
