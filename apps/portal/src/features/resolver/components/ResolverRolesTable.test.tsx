import { computeResolverResource } from '@ensdomains/ensjs/utils/v2'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResolverRole } from '@/features/resolver/hooks/useResolverOverview'
import type { Transaction } from '@/features/transaction-manager/types'
import { ROOT_RESOURCE } from '@/lib/roles/resolverRoles'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { ResolverRolesTable } from './ResolverRolesTable'

const resolverAddress = '0x1111111111111111111111111111111111111111' as Address
const admin = '0x9999999999999999999999999999999999999999' as Address
const alice = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const bob = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address
const avatar = computeResolverResource({ kind: 'text', key: 'avatar' })

// Bit 0 is ROLE_SET_ADDRESS and bit 4 ROLE_SET_TEXT, as in
// lib/roles/resolverRoles.test.ts.
const SET_ADDRESS = 1n << 0n
const SET_TEXT = 1n << 4n

// This component drives mocked mutation callbacks, not the wallet SDK. Keep
// real flow identities without booting the transaction manager's SDK barrel.
vi.mock('@ens-apps/transaction-manager', async () => ({
  ...(await import('@ens-apps/transaction-manager/helpers/flow-identity')),
  transactionManager: { startTransaction: vi.fn() },
  waitForTransaction: vi.fn(),
}))

vi.mock('@/components/EntityBadge', () => ({
  EntityBadge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}))
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))

const openModal = vi.fn()
const closeModal = vi.fn()
vi.mock('@/features/transaction-manager/hooks/useTransactionModal', () => ({
  useTransactionModal: () => ({
    isOpen: false,
    openModal,
    closeModal,
    clearTransaction: vi.fn(),
  }),
}))

// The modal's steps are what the user confirms; render their names and keep
// the latest set so a test can drive them.
let steps: readonly Transaction[] = []
vi.mock('@/features/transaction-manager/components/TransactionModal', () => ({
  TransactionModal: ({
    transactions,
  }: {
    transactions: readonly Transaction[]
  }) => {
    steps = transactions
    return (
      <ul aria-label="Transaction steps">
        {transactions.map((t) => (
          <li key={t.id}>{t.transactionName}</li>
        ))}
      </ul>
    )
  },
}))

const saveMutate = vi.fn()
const removeMutate = vi.fn()
const idleMutation = (mutate: typeof saveMutate) => ({
  mutate,
  reset: vi.fn(),
  isPending: false,
  error: null,
})
vi.mock('@/features/resolver/hooks/useResolverRolesMutations', () => ({
  useResolverRolesMutations: () => ({
    saveMutation: idleMutation(saveMutate),
    removeUserMutation: idleMutation(removeMutate),
    isWalletConnected: true,
    connectedAddress: admin,
  }),
}))

const role = (
  account: Address,
  bitmap: bigint,
  resource: bigint = ROOT_RESOURCE,
): ResolverRole => ({
  account,
  resource: resource.toString(),
  roleBitmap: bitmap.toString(),
  blockNumber: 1,
  transactionHash: null,
  timestamp: null,
  name: null,
})

const renderTable = (roles: readonly ResolverRole[]) =>
  render(
    <ResolverRolesTable
      roles={roles}
      resolverAddress={resolverAddress}
      canManageRoles
    />,
  )

const editRow = (index: number) =>
  userEvent.click(
    screen.getAllByRole('button', { name: 'Edit user roles' })[
      index
    ] as Element,
  )

const userCheckbox = (roleKey: string) => {
  const checkbox = document.getElementById(`${roleKey}-manager`)
  if (!checkbox) throw new Error(`no checkbox for ${roleKey}`)
  return checkbox
}

beforeEach(() => {
  steps = []
  openModal.mockClear()
  closeModal.mockClear()
  saveMutate.mockClear()
  removeMutate.mockClear()
})

// Immunefi #90379 and duplicates: rows were keyed by index, so a pending draft
// followed the index to whichever account slid into it.
describe('ResolverRolesTable row identity', () => {
  it('keeps the editor on the selected account when an earlier row is removed', async () => {
    const { rerender } = renderTable([
      role(alice, SET_ADDRESS),
      role(bob, SET_TEXT),
    ])

    await editRow(1)
    await userEvent.click(userCheckbox('ROLE_SET_ABI'))

    // Alice's row goes away; Bob now sits at index 0.
    rerender(
      <ResolverRolesTable
        roles={[role(bob, SET_TEXT)]}
        resolverAddress={resolverAddress}
        canManageRoles
      />,
    )

    expect(
      screen.getByRole('heading', {
        name: new RegExp(`^${truncateAddress(bob, 6, 4)}`),
      }),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    // Root scope is named in the confirmation before anything is submitted.
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(
      within(screen.getByRole('list', { name: 'Transaction steps' })).getByText(
        `Update roles for ${bob} on All names`,
      ),
    ).toBeInTheDocument()
    steps[0]?.onStart()
    expect(saveMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        account: bob,
        resource: ROOT_RESOURCE,
        rolesToGrant: ['ROLE_SET_ABI'],
        rolesToRevoke: [],
      }),
    )
  })

  it("doesn't hand a removed account's draft to the account that takes its place", async () => {
    const { rerender } = renderTable([
      role(alice, SET_ADDRESS),
      role(bob, SET_TEXT),
    ])

    await editRow(0)
    await userEvent.click(userCheckbox('ROLE_UPGRADE'))
    expect(userCheckbox('ROLE_UPGRADE')).toHaveAttribute(
      'data-state',
      'checked',
    )

    // Alice is removed while her editor is open.
    rerender(
      <ResolverRolesTable
        roles={[role(bob, SET_TEXT)]}
        resolverAddress={resolverAddress}
        canManageRoles
      />,
    )
    expect(screen.getByText('No role selected')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    await userEvent.keyboard('{Escape}')

    // Bob, now at Alice's old index, opens with his own roles only.
    await editRow(0)
    expect(userCheckbox('ROLE_UPGRADE')).toHaveAttribute(
      'data-state',
      'unchecked',
    )
    expect(userCheckbox('ROLE_SET_TEXT')).toHaveAttribute(
      'data-state',
      'checked',
    )
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('re-seeds the draft when a refetch changes the row it was built from', async () => {
    const { rerender } = renderTable([role(bob, SET_TEXT)])

    await editRow(0)
    await userEvent.click(userCheckbox('ROLE_SET_ABI'))

    rerender(
      <ResolverRolesTable
        roles={[role(bob, SET_TEXT | SET_ADDRESS)]}
        resolverAddress={resolverAddress}
        canManageRoles
      />,
    )

    expect(userCheckbox('ROLE_SET_ABI')).toHaveAttribute(
      'data-state',
      'unchecked',
    )
    expect(userCheckbox('ROLE_SET_ADDRESS')).toHaveAttribute(
      'data-state',
      'checked',
    )
  })
})

// Immunefi #92605 / #92820: "Remove user" sent one scoped revoke under a
// dialog that promised removal from every role.
describe('ResolverRolesTable Remove user', () => {
  it('lists and revokes every scope the account holds', async () => {
    renderTable([
      role(alice, SET_ADDRESS),
      role(alice, SET_TEXT, avatar),
      role(bob, SET_TEXT),
    ])

    // Opened from the scoped row, but the removal still covers root.
    await editRow(1)
    expect(
      screen.getByText(/also holds roles on 1 other scope/),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove user' }))

    const dialog = screen.getByRole('dialog', { name: 'Remove user' })
    expect(within(dialog).getByText('All names')).toBeInTheDocument()
    expect(within(dialog).getByText('text "avatar"')).toBeInTheDocument()

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Remove' }),
    )

    expect(openModal).toHaveBeenCalledOnce()
    expect(steps).toHaveLength(2)

    steps[0]?.onStart()
    expect(removeMutate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        account: alice,
        revocation: expect.objectContaining({
          resource: ROOT_RESOURCE,
          roles: ['ROLE_SET_ADDRESS'],
        }),
      }),
    )
    steps[0]?.onDone()
    expect(removeMutate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        account: alice,
        revocation: expect.objectContaining({
          resource: avatar,
          roles: ['ROLE_SET_TEXT'],
        }),
      }),
    )
    // Bob is never touched.
    expect(removeMutate).not.toHaveBeenCalledWith(
      expect.objectContaining({ account: bob }),
    )
  })

  it('offers no removal when one of the grants cannot be read', async () => {
    renderTable([
      role(alice, SET_ADDRESS),
      {
        ...role(alice, SET_TEXT),
        resource: 'not-a-number',
      },
    ])

    await editRow(0)

    expect(screen.getByRole('button', { name: 'Remove user' })).toBeDisabled()
    expect(
      screen.getByText(/holds a grant whose scope can't be read/),
    ).toBeInTheDocument()
  })
})

describe('ResolverRolesTable unknown scopes', () => {
  it('shows the grant without a root label or edit action', () => {
    renderTable([
      {
        ...role(alice, SET_TEXT),
        resource: null,
        registrationId: 'opaque-handle',
      },
    ])
    expect(screen.getByText('Scope unavailable')).toBeInTheDocument()
    expect(screen.getByText(truncateAddress(alice, 6, 4))).toBeInTheDocument()
    expect(screen.queryByText('All names')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Edit user roles' }),
    ).not.toBeInTheDocument()
  })

  it('keeps known scopes editable but prevents removing an account with unknown grants', async () => {
    renderTable([
      role(alice, SET_TEXT, avatar),
      { ...role(alice, SET_ADDRESS), resource: null },
    ])
    expect(
      screen.getAllByRole('button', { name: 'Edit user roles' }),
    ).toHaveLength(1)
    await editRow(0)
    expect(screen.getByRole('button', { name: 'Remove user' })).toBeDisabled()
    expect(removeMutate).not.toHaveBeenCalled()
  })

  it('prevents whole-account removal when role enumeration is incomplete', async () => {
    render(
      <ResolverRolesTable
        roles={[role(alice, SET_TEXT, avatar)]}
        resolverAddress={resolverAddress}
        canManageRoles
        isComplete={false}
      />,
    )
    await editRow(0)
    expect(screen.getByRole('button', { name: 'Remove user' })).toBeDisabled()
  })
})
