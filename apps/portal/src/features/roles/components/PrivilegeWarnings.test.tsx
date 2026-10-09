import { normalize } from '@ensdomains/ensjs/utils'
import type { Role } from '@ensdomains/ensjs/utils/v2'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GetEnsOwnerReturnType } from '@/features/profile/hooks/useEnsOwner'
import { getExpectedWrapperRegistry } from '@/features/registry/utils/wrapperRegistry'
import { createTestQueryClient, createTestWrapper } from '@/test-utils'

const OWNER: Address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const OTHER: Address = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const SUBREGISTRY: Address = '0x2222222222222222222222222222222222222222'

const ALL_TOKEN_ROLES: Role[] = [
  'ROLE_SET_SUBREGISTRY',
  'ROLE_SET_SUBREGISTRY_ADMIN',
  'ROLE_SET_RESOLVER',
  'ROLE_SET_RESOLVER_ADMIN',
  'ROLE_CAN_TRANSFER_ADMIN',
]

let holders = new Map<Address, Role[]>()
const fetchHolders = vi.fn(async () => ({ holders, isVerified: true }))

vi.mock('@/features/roles/hooks/useNameRoleAccounts', () => ({
  getNameRolesAccountsQueryOptions: (params: { resource: bigint | null }) => ({
    // The real builder stringifies the resource because the default key hash
    // can't serialise a bigint.
    queryKey: [
      'get-name-roles-accounts',
      { ...params, resource: params.resource?.toString() ?? null },
    ],
    queryFn: fetchHolders,
  }),
}))

// The role read is keyed by the registry's versioned resource (WEB-1458), which
// the hook resolves itself off the chain. Stub the read; let a test hold it open
// to assert the warning stays off until the resource is known.
let resourceRead: Promise<bigint> = Promise.resolve(1n)
vi.mock('@/features/roles/hooks/useVersionedResource', () => ({
  getVersionedResourceQueryOptions: (params: {
    name: string
    registryAddress: string
  }) => ({
    queryKey: ['get-versioned-resource', params],
    queryFn: async () => resourceRead,
  }),
}))

const grace = { isInGrace: false, isLoading: false }
vi.mock('@/features/profile/hooks/useGraceStatus', () => ({
  useGraceStatus: () => grace,
}))

const {
  ResolverPrivilegeWarning,
  SubregistryPrivilegeWarning,
  TransferPrivilegeWarning,
} = await import('./PrivilegeWarnings')

const ownerData = (
  protocolVersion: 'ENSv1' | 'ENSv2' = 'ENSv2',
): NonNullable<GetEnsOwnerReturnType> => ({
  owner: OWNER,
  registryAddress: REGISTRY,
  protocolVersion,
})

const ownerWithout = (...roles: Role[]) =>
  new Map<Address, Role[]>([
    [OWNER, ALL_TOKEN_ROLES.filter((role) => !roles.includes(role))],
  ])

const renderWarning = (ui: React.ReactElement) => {
  const queryClient = createTestQueryClient()
  const view = render(ui, { wrapper: createTestWrapper(queryClient) })
  /**
   * Resolves once the role read has landed, so an empty render is a verdict.
   *
   * Wait on the last role query, not the first: the hook renders once with a
   * null resource (that query is disabled, so it stays pending forever) and
   * again once the versioned resource lands.
   */
  const settled = () =>
    waitFor(() =>
      expect(
        queryClient
          .getQueryCache()
          .findAll({ queryKey: ['get-name-roles-accounts'] })
          .at(-1)?.state.status,
      ).toBe('success'),
    )
  return { ...view, settled }
}

/** Radix opens the tooltip on keyboard focus. */
const openTooltip = async () => {
  await userEvent.tab()
  return screen.findByRole('tooltip')
}

// The first normalize call builds its tables, slow enough on CI to outlast findByText.
beforeAll(() => {
  normalize('alice.eth')
})

beforeEach(() => {
  holders = new Map([[OWNER, ALL_TOKEN_ROLES]])
  Object.assign(grace, { isInGrace: false, isLoading: false })
  resourceRead = Promise.resolve(1n)
  fetchHolders.mockClear()
})

describe('TransferPrivilegeWarning', () => {
  it('flags an owner without ROLE_CAN_TRANSFER_ADMIN', async () => {
    holders = ownerWithout('ROLE_CAN_TRANSFER_ADMIN')

    renderWarning(
      <TransferPrivilegeWarning name="alice.eth" ownerData={ownerData()} />,
    )

    expect(await screen.findByText('Cannot transfer')).toBeInTheDocument()
    expect(await openTooltip()).toHaveTextContent(
      'Missing token ROLE_CAN_TRANSFER_ADMIN',
    )
  })

  it('flags a token another account holds roles on', async () => {
    holders = new Map([
      [OWNER, ALL_TOKEN_ROLES],
      [OTHER, ['ROLE_SET_RESOLVER']],
    ])

    renderWarning(
      <TransferPrivilegeWarning name="alice.eth" ownerData={ownerData()} />,
    )

    expect(
      await screen.findByText('Cannot transfer safely'),
    ).toBeInTheDocument()
    expect(await openTooltip()).toHaveTextContent(
      'Another address holds roles on this token',
    )
  })

  it('renders nothing when the owner alone holds every role', async () => {
    const { container, settled } = renderWarning(
      <TransferPrivilegeWarning name="alice.eth" ownerData={ownerData()} />,
    )

    await settled()
    expect(container).toBeEmptyDOMElement()
  })

  // Role logs are emitted under the registry's current `eacVersionId`, so the
  // read can't be keyed by label alone (WEB-1458) — and "resource unknown" is
  // not "no one holds a role".
  it("doesn't read roles until the name's resource is known", async () => {
    holders = ownerWithout('ROLE_CAN_TRANSFER_ADMIN')
    resourceRead = new Promise(() => {})

    const { container } = renderWarning(
      <TransferPrivilegeWarning name="alice.eth" ownerData={ownerData()} />,
    )

    await waitFor(() => expect(container).toBeEmptyDOMElement())
    expect(fetchHolders).not.toHaveBeenCalled()
  })

  // A lapsed name can't be transferred until it's renewed, whatever its roles say.
  it('stays quiet while the name is in grace', () => {
    holders = ownerWithout('ROLE_CAN_TRANSFER_ADMIN')
    grace.isInGrace = true

    const { container } = renderWarning(
      <TransferPrivilegeWarning name="alice.eth" ownerData={ownerData()} />,
    )

    expect(fetchHolders).not.toHaveBeenCalled()
    expect(container).toBeEmptyDOMElement()
  })

  it("doesn't read roles for an ENSv1 name", () => {
    const { container } = renderWarning(
      <TransferPrivilegeWarning
        name="alice.eth"
        ownerData={ownerData('ENSv1')}
      />,
    )

    expect(fetchHolders).not.toHaveBeenCalled()
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ResolverPrivilegeWarning', () => {
  it('names both missing roles when the resolver is locked', async () => {
    holders = ownerWithout('ROLE_SET_RESOLVER', 'ROLE_SET_RESOLVER_ADMIN')

    renderWarning(
      <ResolverPrivilegeWarning name="alice.eth" ownerData={ownerData()} />,
    )

    expect(await screen.findByText('Resolver locked')).toBeInTheDocument()
    expect(await openTooltip()).toHaveTextContent(
      'Missing token ROLE_SET_RESOLVER and ROLE_SET_RESOLVER_ADMIN',
    )
  })

  it('names only the admin role when that alone is missing', async () => {
    holders = ownerWithout('ROLE_SET_RESOLVER_ADMIN')

    renderWarning(
      <ResolverPrivilegeWarning name="alice.eth" ownerData={ownerData()} />,
    )

    expect(await screen.findByText('Resolver locked')).toBeInTheDocument()
    const tooltip = await openTooltip()
    expect(tooltip).toHaveTextContent('Missing token ROLE_SET_RESOLVER_ADMIN')
    expect(tooltip).not.toHaveTextContent('ROLE_SET_RESOLVER and')
  })
})

describe('SubregistryPrivilegeWarning', () => {
  it('flags a locked subregistry', async () => {
    holders = ownerWithout('ROLE_SET_SUBREGISTRY', 'ROLE_SET_SUBREGISTRY_ADMIN')

    renderWarning(
      <SubregistryPrivilegeWarning
        name="alice.eth"
        ownerData={ownerData()}
        subregistry={SUBREGISTRY}
        chainId={sepolia.id}
      />,
    )

    expect(await screen.findByText('Subregistry locked')).toBeInTheDocument()
    expect(await openTooltip()).toHaveTextContent(
      'Missing token ROLE_SET_SUBREGISTRY and ROLE_SET_SUBREGISTRY_ADMIN',
    )
  })

  it("exempts the name's canonical WrapperRegistry", async () => {
    holders = ownerWithout('ROLE_SET_SUBREGISTRY', 'ROLE_SET_SUBREGISTRY_ADMIN')
    const wrapper = getExpectedWrapperRegistry({
      name: 'alice.eth',
      chainId: sepolia.id,
    })
    if (!wrapper) throw new Error('Sepolia should have a wrapper registry')

    const { container, settled } = renderWarning(
      <SubregistryPrivilegeWarning
        name="alice.eth"
        ownerData={ownerData()}
        subregistry={wrapper}
        chainId={sepolia.id}
      />,
    )

    await settled()
    expect(container).toBeEmptyDOMElement()
  })
})
