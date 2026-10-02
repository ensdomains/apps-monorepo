import type { Role } from '@ensdomains/ensjs/utils/v2'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
const fetchHolders = vi.fn(async () => holders)

vi.mock('@/features/roles/hooks/useNameRoleAccounts', () => ({
  getNameRolesAccountsQueryOptions: (params: unknown) => ({
    queryKey: ['get-name-roles-accounts', params],
    queryFn: fetchHolders,
  }),
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
  /** Resolves once the role read has landed, so an empty render is a verdict. */
  const settled = () =>
    waitFor(() =>
      expect(queryClient.getQueryCache().getAll()[0]?.state.status).toBe(
        'success',
      ),
    )
  return { ...view, settled }
}

/** Radix opens the tooltip on keyboard focus. */
const openTooltip = async () => {
  await userEvent.tab()
  return screen.findByRole('tooltip')
}

beforeEach(() => {
  holders = new Map([[OWNER, ALL_TOKEN_ROLES]])
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
