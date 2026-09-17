import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoleContractKind } from '../utils/roleContractKind'

// Immunefi #91335 / #92771: each roles page applied its own bit layout to
// whatever address was in the URL. Both pages must refuse the other model.

const address = '0x1111111111111111111111111111111111111111' as Address
const caller = '0x9999999999999999999999999999999999999999' as Address

let kind: RoleContractKind = 'unsupported'
vi.mock('@/features/roles/hooks/useRoleContractKind', () => ({
  useRoleContractKind: () => ({ data: kind, isLoading: false, error: null }),
}))

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="/">{children}</a>
  ),
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useParams: () => ({ address }),
  }),
}))

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConnection: () => ({ address: caller }),
  useWalletClient: () => ({ data: { account: { address: caller } } }),
}))

// Everything below the gate reports the caller as an admin, so the only thing
// standing between them and a grant is the gate.
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQuery: (options: { queryKey: readonly unknown[] }) => {
      const key = options.queryKey[0]
      if (key === 'hasRoles')
        return { data: true, isLoading: false, error: null }
      if (key === 'get-registry-info')
        return { data: { address }, isLoading: false, error: null }
      if (key === 'resolver-overview')
        return {
          data: { roles: [{ account: caller }], namedResources: [] },
          isLoading: false,
          error: null,
        }
      return { data: undefined, isLoading: false, error: null }
    },
  }
})

vi.mock('@/components/PageHeading', () => ({
  PageHeading: ({ children }: { children: React.ReactNode }) => (
    <h1>{children}</h1>
  ),
}))
vi.mock('@/features/registry/components/v2/RegistryRolesTable', () => ({
  RegistryRolesTable: () => <div>registry roles table</div>,
}))
vi.mock('@/features/registry/components/v2/RegistryAddUserSheet', () => ({
  RegistryAddUserSheet: () => <div>registry add user sheet</div>,
}))
vi.mock('@/features/resolver/components/ResolverRolesTable', () => ({
  ResolverRolesTable: () => <div>resolver roles table</div>,
}))
vi.mock('@/features/resolver/components/ResolverAddUserSheet', () => ({
  ResolverAddUserSheet: () => <div>resolver add user sheet</div>,
}))

const { RoleContractGate } = await import('./RoleContractGate')
const { Route: RegistryRolesRoute } = await import(
  '@/routes/registry/$address/roles'
)
const { Route: ResolverRolesRoute } = await import(
  '@/routes/resolver/$address/roles/index'
)

const renderRoute = (route: unknown) => {
  const Component = (route as { component: () => React.ReactNode }).component
  return render(<Component />)
}

beforeEach(() => navigate.mockClear())

describe('/registry/$address/roles', () => {
  it('refuses a permissioned resolver and points at its own roles page', async () => {
    kind = 'permissioned-resolver'
    renderRoute(RegistryRolesRoute)

    expect(screen.getByText('Not a registry')).toBeInTheDocument()
    expect(screen.queryByText('registry roles table')).toBeNull()
    expect(screen.queryByText('registry add user sheet')).toBeNull()
    expect(screen.queryByRole('button', { name: /Add User/i })).toBeNull()

    await userEvent.click(
      screen.getByRole('button', { name: 'Open resolver roles' }),
    )
    expect(navigate).toHaveBeenCalledWith({
      to: '/resolver/$address/roles',
      params: { address },
    })
  })

  it('refuses a contract that is neither, with nowhere to send the user', () => {
    kind = 'unsupported'
    renderRoute(RegistryRolesRoute)

    expect(screen.getByText('Not a registry')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Open/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Add User/i })).toBeNull()
  })

  it('shows the editor for a registry', () => {
    kind = 'registry'
    renderRoute(RegistryRolesRoute)

    expect(screen.getByText('registry roles table')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Add User/i }),
    ).toBeInTheDocument()
  })
})

describe('/resolver/$address/roles', () => {
  it('refuses a registry and points at its own roles page', () => {
    kind = 'registry'
    renderRoute(ResolverRolesRoute)

    expect(screen.getByText('Not a permissioned resolver')).toBeInTheDocument()
    expect(screen.queryByText('resolver roles table')).toBeNull()
    expect(screen.queryByText('resolver add user sheet')).toBeNull()
    expect(screen.queryByRole('button', { name: /Add user/i })).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Open registry roles' }),
    ).toBeInTheDocument()
  })

  it('shows the editor for a permissioned resolver', () => {
    kind = 'permissioned-resolver'
    renderRoute(ResolverRolesRoute)

    expect(screen.getByText('resolver roles table')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Add user/i }),
    ).toBeInTheDocument()
  })
})

describe('RoleContractGate embedded', () => {
  it('explains why nothing is shown, without a link', () => {
    kind = 'registry'
    render(
      <RoleContractGate
        address={address}
        expected="permissioned-resolver"
        variant="embedded"
      >
        <div>resolver roles</div>
      </RoleContractGate>,
    )

    expect(screen.getByText('No resolver roles')).toBeInTheDocument()
    expect(screen.queryByText('resolver roles')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
