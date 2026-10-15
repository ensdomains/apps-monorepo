import { computeResolverResource } from '@ensdomains/ensjs/utils/v2'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Transaction } from '@/features/transaction-manager/types'
import { resourceIdFromChainValue } from '@/lib/resource/resourceId'
import {
  type AccountRoleGroup,
  type ResolverRevocation,
  type ResolverRole,
  ROOT_RESOURCE,
  ROOT_RESOURCE_LABEL,
  resolverAdminRoleOf,
  resolverPermissions,
  UNREADABLE_RESOURCE_LABEL,
} from '@/lib/roles/resolverRoles'
import { ResolverRolesSidebar } from './ResolverRolesSidebar'

const resolverAddress = '0x1111111111111111111111111111111111111111' as Address
const admin = '0x9999999999999999999999999999999999999999' as Address
const alice = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address

const avatar = resourceIdFromChainValue(
  computeResolverResource({ kind: 'text', key: 'avatar' }),
)._unsafeUnwrap()

vi.mock('@/components/CopyButton', () => ({ CopyButton: () => null }))
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))

const openModal = vi.fn()
vi.mock('@/features/transaction-manager/hooks/useTransactionModal', () => ({
  useTransactionModal: () => ({
    isOpen: false,
    openModal,
    closeModal: vi.fn(),
    clearTransaction: vi.fn(),
  }),
}))

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
vi.mock('@/features/resolver/hooks/useResolverRolesMutations', () => ({
  useResolverRolesMutations: () => ({
    saveMutation: {
      mutate: saveMutate,
      reset: vi.fn(),
      isPending: false,
      error: null,
    },
    removeUserMutation: {
      mutate: removeMutate,
      reset: vi.fn(),
      isPending: false,
      error: null,
    },
    isWalletConnected: true,
    connectedAddress: admin,
  }),
}))

const allAdminRoles: ReadonlySet<ResolverRole> = new Set(
  resolverPermissions.map(({ key }) => resolverAdminRoleOf(key)),
)
let callerAdminRoles = allAdminRoles
/** Each scope's on-chain revoke check; `undefined` is still loading. */
let revokeChecks: readonly { readonly data: boolean | undefined }[] = [
  { data: true },
]

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueries: ({
    combine,
  }: {
    readonly combine: (results: typeof revokeChecks) => boolean
  }) => combine(revokeChecks),
}))

vi.mock('@/features/resolver/hooks/useResolverCallerAdminRoles', () => ({
  useResolverCallerAdminRoles: () => callerAdminRoles,
}))

const group = (overrides: Partial<AccountRoleGroup>): AccountRoleGroup => ({
  account: alice,
  resource: ROOT_RESOURCE.toString(),
  resourceId: ROOT_RESOURCE,
  isRoot: true,
  resourceLabel: ROOT_RESOURCE_LABEL,
  roles: [],
  decodedRoles: ['ROLE_SET_ADDRESS'],
  ...overrides,
})

const renderSidebar = (
  g: AccountRoleGroup,
  revocations: readonly ResolverRevocation[] = [],
) =>
  render(
    <ResolverRolesSidebar
      group={g}
      removalPlan={{ type: 'complete', revocations }}
      open
      setOpen={vi.fn()}
      resolverAddress={resolverAddress}
      canManageRoles
    />,
  )

const userCheckbox = (roleKey: string) => {
  const checkbox = document.getElementById(`${roleKey}-manager`)
  if (!checkbox) throw new Error(`no checkbox for ${roleKey}`)
  return checkbox
}

beforeEach(() => {
  callerAdminRoles = allAdminRoles
  revokeChecks = [{ data: true }]
  steps = []
  openModal.mockClear()
  saveMutate.mockClear()
  removeMutate.mockClear()
})

describe('ResolverRolesSidebar scope handling', () => {
  // WEB-1513: a resource the page could not read used to become the empty
  // string, which the save path read back as ROOT — so an operator scoping a
  // change to one grant silently changed it for every name on the resolver.
  it('refuses to save a row whose scope cannot be read, rather than saving at root', async () => {
    // A grant whose indexer resource does not parse. It is listed rather than
    // hidden, so the operator can see it exists — and it carries no resource,
    // so nothing can be written against it.
    renderSidebar(
      group({
        isRoot: false,
        resource: 'raw:not-a-number',
        resourceId: null,
        resourceLabel: UNREADABLE_RESOURCE_LABEL,
      }),
    )

    expect(
      screen.getByText(/scope of this grant can't be read/i),
    ).toBeInTheDocument()

    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()

    await userEvent.click(save)

    expect(saveMutate).not.toHaveBeenCalled()
    expect(openModal).not.toHaveBeenCalled()
    expect(steps).toEqual([])
  })

  it('names the scope in the confirmation before a root-scoped save is issued', async () => {
    renderSidebar(group({}))

    await userEvent.click(userCheckbox('ROLE_SET_TEXT'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    // Nothing is submitted until the operator has read the scope.
    expect(openModal).not.toHaveBeenCalled()
    expect(
      screen.getByText(/apply to every name this resolver serves/i),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(openModal).toHaveBeenCalledTimes(1)
    steps[0]?.onStart()
    expect(saveMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        account: alice,
        resource: ROOT_RESOURCE,
        rolesToGrant: ['ROLE_SET_TEXT'],
      }),
    )
  })

  it("carries a scoped row's own resource into the save, not root", async () => {
    renderSidebar(
      group({
        isRoot: false,
        resource: avatar.toString(),
        resourceId: avatar,
        resourceLabel: 'text "avatar"',
        decodedRoles: ['ROLE_SET_TEXT'],
      }),
    )

    await userEvent.click(userCheckbox('ROLE_SET_TEXT'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    steps[0]?.onStart()
    expect(saveMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: avatar,
        rolesToRevoke: ['ROLE_SET_TEXT'],
      }),
    )
    expect(saveMutate).not.toHaveBeenCalledWith(
      expect.objectContaining({ resource: ROOT_RESOURCE }),
    )
  })
})

describe('ResolverRolesSidebar admin gating', () => {
  // WEB-1818: every checkbox used to unlock on one page-wide flag, so a caller
  // without a role's `_ADMIN` could tick it and the save reverted.
  it('enables only the roles whose _ADMIN the caller holds', () => {
    callerAdminRoles = new Set<ResolverRole>(['ROLE_SET_TEXT_ADMIN'])
    renderSidebar(group({}))

    expect(userCheckbox('ROLE_SET_TEXT')).toBeEnabled()
    expect(userCheckbox('ROLE_SET_ADDRESS')).toBeDisabled()
    expect(userCheckbox('ROLE_UPGRADE')).toBeDisabled()
  })

  describe('Remove user across scopes', () => {
    const revocations: readonly ResolverRevocation[] = [
      {
        resource: ROOT_RESOURCE,
        resourceLabel: ROOT_RESOURCE_LABEL,
        roles: ['ROLE_SET_ADDRESS'],
      },
      {
        resource: avatar,
        resourceLabel: 'text "avatar"',
        roles: ['ROLE_SET_TEXT'],
      },
    ]
    const removeUser = () =>
      screen.getByRole('button', { name: /Remove user/i })

    it('is enabled when every scope can be revoked', () => {
      revokeChecks = [{ data: true }, { data: true }]
      renderSidebar(group({}), revocations)

      expect(removeUser()).toBeEnabled()
    })

    it('is disabled when one scope is denied, so it cannot stop part-way', () => {
      revokeChecks = [{ data: true }, { data: false }]
      renderSidebar(group({}), revocations)

      expect(removeUser()).toBeDisabled()
    })

    it('is disabled while a scope is still being checked', () => {
      revokeChecks = [{ data: true }, { data: undefined }]
      renderSidebar(group({}), revocations)

      expect(removeUser()).toBeDisabled()
    })
  })
})
