import { render as baseRender, screen } from '@testing-library/react'
import { ok } from 'neverthrow'
import type { ReactElement } from 'react'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestWrapper } from '@/test-utils/providers'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { RoleAccountBadge } from './RoleAccountBadge'

const HCA = '0x0725c395fb2393379654403399130c6802fa4ebe' as Address
const OWNER = '0x21984fE740E949482f455261594BCA47AB19Cc40' as Address
const EOA = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address

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
    <a href={to} data-params={JSON.stringify(params)} className={className}>
      {children}
    </a>
  ),
}))

vi.mock('@/features/profile/components/NameAvatar', () => ({
  NameAvatar: () => <div data-testid="name-avatar" />,
}))

// Primary names by address; the HCA factory binding by HCA address.
const names = vi.hoisted(() => new Map<string, string>())
const hcaOwners = vi.hoisted(() => new Map<string, Address>())

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useEnsName: ({ address }: { address?: Address }) => ({
    data: address ? names.get(address.toLowerCase()) : undefined,
  }),
}))

vi.mock('@/features/roles/hooks/useHcaOwner', () => ({
  getHcaOwnerQueryOptions: ({ account }: { account: Address }) => ({
    queryKey: ['get-hca-owner', account],
    queryFn: async () => ok(hcaOwners.get(account.toLowerCase()) ?? null),
    select: (result: { _unsafeUnwrap: () => Address | null }) =>
      result._unsafeUnwrap(),
  }),
}))

const render = (ui: ReactElement) =>
  baseRender(ui, { wrapper: createTestWrapper() })

const chip = (text: string) => screen.getByText(text, { selector: 'a' })
// The HCA chip splits its text across nodes, so match on the link's full text.
const hcaChip = () =>
  screen.getByText(
    (_, element) =>
      element?.tagName === 'A' && /HCA 0x/.test(element.textContent ?? ''),
  )

describe('RoleAccountBadge', () => {
  beforeEach(() => {
    names.clear()
    hcaOwners.clear()
  })

  it('shows a plain account as its truncated address', () => {
    render(<RoleAccountBadge account={EOA} />)

    expect(screen.getByText(truncateAddress(EOA, 6, 4))).toBeInTheDocument()
    expect(screen.queryByText('HCA')).not.toBeInTheDocument()
  })

  it('shows a plain account with a primary name as the name', () => {
    names.set(EOA, 'alice.eth')
    render(<RoleAccountBadge account={EOA} />)

    expect(screen.getByText('alice.eth').closest('a')).toHaveAttribute(
      'href',
      '/$name',
    )
    expect(chip('Address')).toHaveAttribute(
      'data-params',
      JSON.stringify({ addr: EOA }),
    )
  })

  it("labels an HCA and shows its owner's primary name", async () => {
    hcaOwners.set(HCA, OWNER)
    names.set(OWNER.toLowerCase(), 'jooooe.eth')
    render(<RoleAccountBadge account={HCA} />)

    expect(await screen.findByText('jooooe.eth')).toBeInTheDocument()
    expect(screen.getByText('HCA', { selector: 'span' })).toBeInTheDocument()
    expect(hcaChip()).toHaveAttribute(
      'data-params',
      JSON.stringify({ addr: HCA }),
    )
    expect(chip('About HCA')).toHaveAttribute(
      'href',
      'https://docs.ens.domains/ensv2/overview/',
    )
    expect(chip('Name')).toHaveAttribute(
      'data-params',
      JSON.stringify({ name: 'jooooe.eth' }),
    )
    expect(screen.queryByText('Address')).not.toBeInTheDocument()
  })

  it("labels an HCA and falls back to its owner's address", async () => {
    hcaOwners.set(HCA, OWNER)
    render(<RoleAccountBadge account={HCA} />)

    expect(
      await screen.findByText(truncateAddress(OWNER, 6, 4)),
    ).toBeInTheDocument()
    expect(screen.getByText('HCA', { selector: 'span' })).toBeInTheDocument()
    expect(chip('Address')).toHaveAttribute(
      'data-params',
      JSON.stringify({ addr: OWNER }),
    )
    expect(hcaChip()).toHaveAttribute(
      'data-params',
      JSON.stringify({ addr: HCA }),
    )
  })
})
