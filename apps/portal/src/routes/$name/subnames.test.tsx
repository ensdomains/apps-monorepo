import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type Address, keccak256, labelhash, toHex } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestQueryClient } from '@/test-utils/providers'

const NAME = 'sugh003.eth'
const CONNECTED: Address = '0x0000000000000000000000000000000000000011'
const SUBREGISTRY: Address = '0x00000000000000000000000000000000000000bb'
const PARENT_REGISTRY: Address = '0x00000000000000000000000000000000000000aa'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useParams: () => ({ name: NAME }),
  }),
}))

// Rows render an avatar that reaches for wagmi config; this file provides only
// a QueryClient, and an unmounting tree would cancel the reads under test.
vi.mock('@/components/EntityBadge', () => ({
  EntityBadge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}))

vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi')>()
  return { ...actual, useAccount: () => ({ address: CONNECTED }) }
})

vi.mock('@/features/profile/hooks/useEnsOwner', () => ({
  getEnsOwnerQueryOptions: () => ({
    queryKey: ['ensOwner', NAME],
    queryFn: () => ({ protocolVersion: 'ENSv2', owner: CONNECTED }),
  }),
}))

vi.mock('@/features/profile/hooks/useNameAvailability', () => ({
  getNameAvailabilityQueryOptions: () => ({
    queryKey: ['availability', NAME],
    queryFn: () => ({ isAvailable: false }),
  }),
}))

// A subname whose label is written literally as `[<64 hex>]`. Those 66
// characters are what the registry hashed at registration, so the row's id is
// `labelhash('[<hex>]')` — NOT the `vault` labelhash the brackets spell out.
const VAULT_LABELHASH = labelhash('vault')
const ENCODED_LABEL = `[${VAULT_LABELHASH.slice(2)}]`
const ENCODED_SUBNAME = `${ENCODED_LABEL}.${NAME}`
const ENCODED_SUBNAME_LABELHASH = keccak256(toHex(ENCODED_LABEL))

let subnames: readonly Record<string, unknown>[] = []

vi.mock('@/features/profile/hooks/useSubnames', () => ({
  SUBNAMES_PAGE_SIZE: 40,
  V1_SUBNAMES_PAGE_SIZE: 100,
  getV2SubnamesQueryOptions: () => ({
    queryKey: ['subnames', NAME],
    queryFn: () => ({ subnames, totalCount: subnames.length }),
    initialPageParam: 0,
    getNextPageParam: () => undefined,
  }),
}))

vi.mock('@/features/registry/hooks/useNameRegistryDiscovery', () => ({
  getNameRegistriesQueryOptions: () => ({
    queryKey: ['nameRegistries', NAME],
    queryFn: () => [SUBREGISTRY, PARENT_REGISTRY, PARENT_REGISTRY],
  }),
}))

/**
 * Stands in for the registry's own answer: roles granted registry-wide live on
 * the ROOT resource, which `hasRoles` reads only when no `label` is passed.
 * `hasRootUnregister` lets a test choose whether the caller holds
 * ROLE_UNREGISTER registry-wide, which decides whether the per-row question is
 * worth asking at all.
 */
let hasRootUnregister = false
const hasRolesParams = vi.fn()
vi.mock('@/features/registry/hooks/useHasRoles', () => ({
  getHasRolesQueryOptions: (params: Record<string, unknown>) => {
    hasRolesParams(params)
    const roles = params.roles as string[] | undefined
    return {
      queryKey: [
        'hasRoles',
        JSON.stringify(params, (_, v) =>
          typeof v === 'bigint' ? v.toString() : v,
        ),
      ],
      queryFn: () =>
        roles?.[0] === 'ROLE_UNREGISTER'
          ? hasRootUnregister
          : !('label' in params),
    }
  },
}))

// Per-row ROLE_UNREGISTER. `resourceRolesParams` records what the options were
// built for; `resourceRolesFetched` records the reads that actually ran, which
// is what the root fast path is supposed to avoid.
const resourceRolesParams = vi.fn()
const resourceRolesFetched = vi.fn()
/** Resources the connected account may unregister; `null` means all of them. */
let allowedResources: Set<string> | null = null
vi.mock(
  '@/features/registry/hooks/useResourceRoles',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/features/registry/hooks/useResourceRoles')
      >()
    return {
      ...actual,
      getResourceRolesQueryOptions: (params: {
        readonly resources: readonly string[]
        readonly registryAddress: string
        readonly roles: readonly string[]
      }) => {
        resourceRolesParams(params)
        return {
          queryKey: ['resourceRoles', params],
          queryFn: () => {
            resourceRolesFetched(params)
            return new Map(
              params.resources.map((resource) => [
                resource,
                allowedResources === null || allowedResources.has(resource),
              ]),
            )
          },
        }
      },
    }
  },
)

vi.mock('@/features/registry/hooks/useDeleteSubname', () => ({
  useDeleteSubname: () => ({ deleteSubname: vi.fn(), isPending: false }),
}))

vi.mock('@/features/transaction-manager/components/TransactionModal', () => ({
  TransactionModal: () => null,
}))

vi.mock('@/features/transaction-manager/hooks/useTransactionModal', () => ({
  useTransactionModal: () => ({
    openModal: vi.fn(),
    closeModal: vi.fn(),
    clearTransaction: vi.fn(),
  }),
}))

// `createFileRoute` is mocked to hand back the options object, so `Route` is
// really `{ component, useParams, ... }` — the router's own types don't
// describe that shape, hence the cast.
const { Route } = await import('./subnames')
const SubnamesRoute = (
  Route as unknown as { component: () => React.ReactElement }
).component

const renderRoute = () => {
  const Component = SubnamesRoute
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <Component />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  hasRolesParams.mockReset()
  resourceRolesParams.mockReset()
  resourceRolesFetched.mockReset()
  subnames = []
  hasRootUnregister = false
  allowedResources = null
})

describe('subnames route role checks', () => {
  // WEB-1249 QA: an account granted every role on the subregistry still saw no
  // "Create subname" button, because the checks passed `label: ''` and so asked
  // about `labelhash('')` instead of the ROOT resource the grant wrote to.
  it('asks about the subregistry ROOT resource, not a label', async () => {
    renderRoute()

    // The first renders run before registry discovery lands, so they ask with
    // no address yet; wait for the ones that name the subregistry.
    const subregistryCalls = () =>
      hasRolesParams.mock.calls
        .map(([params]) => params)
        .filter((params) => params.registryAddress === SUBREGISTRY)

    await waitFor(() => expect(subregistryCalls().length).toBeGreaterThan(0))

    const registryRoleParams = subregistryCalls()
    for (const params of registryRoleParams) {
      expect(params).not.toHaveProperty('label')
    }
    expect(registryRoleParams.map((params) => params.roles)).toEqual(
      expect.arrayContaining([['ROLE_REGISTRAR']]),
    )
  })

  // WEB-1458: the delete gate used to be one ROOT question for the whole table,
  // so a row the caller has no role on was still offered. It is now asked per
  // row, about that row's own resource.
  it('asks about ROLE_UNREGISTER per row, using the id the indexer gave', async () => {
    subnames = [
      {
        name: ENCODED_SUBNAME,
        labelhash: ENCODED_SUBNAME_LABELHASH,
        owner: CONNECTED,
      },
    ]

    renderRoute()

    const asked = () =>
      resourceRolesFetched.mock.calls
        .map(([params]) => params)
        .filter((params) => params.resources.length > 0)

    await waitFor(() => expect(asked().length).toBeGreaterThan(0))
    for (const params of asked()) {
      expect(params.registryAddress).toBe(SUBREGISTRY)
      expect(params.roles).toEqual(['ROLE_UNREGISTER'])
      // The literal label's hash, never the hash the brackets spell out.
      expect(params.resources).toEqual([
        BigInt(ENCODED_SUBNAME_LABELHASH).toString(),
      ])
      expect(params.resources).not.toContain(BigInt(VAULT_LABELHASH).toString())
    }

    // The registry-wide question is still asked, but as the ROOT question it
    // is — never keyed on a label or on one row's resource.
    for (const params of hasRolesParams.mock.calls
      .map(([params]) => params)
      .filter((params) => params.roles?.[0] === 'ROLE_UNREGISTER')) {
      expect(params).not.toHaveProperty('label')
      expect(params).not.toHaveProperty('resource')
    }
  })

  // The registry ORs root roles into every resource, so a registry-wide holder
  // needs no per-row reads at all.
  it('skips the per-row reads when the account holds the role registry-wide', async () => {
    hasRootUnregister = true
    subnames = [
      {
        name: ENCODED_SUBNAME,
        labelhash: ENCODED_SUBNAME_LABELHASH,
        owner: CONNECTED,
      },
    ]

    renderRoute()

    // Wait until the row's resource is known, which is the point the per-row
    // read would have fired had the root answer not settled it.
    await waitFor(() =>
      expect(
        resourceRolesParams.mock.calls
          .map(([params]) => params)
          .filter((params) => params.resources.length > 0).length,
      ).toBeGreaterThan(0),
    )

    expect(resourceRolesFetched).not.toHaveBeenCalled()
  })

  it('offers subname creation to a registry-wide role holder', async () => {
    renderRoute()

    expect(
      await screen.findByRole('link', { name: /create subname/i }),
    ).toBeInTheDocument()
  })

  // WEB-1458 follow-up: with the delete gate now per row, selection has to
  // follow it. A table-wide checkbox over per-row permissions would let an
  // operator tick ten names and silently delete two.
  it('offers selection only for the rows the account can delete', async () => {
    const otherLabelhash = labelhash('cold')
    subnames = [
      {
        name: ENCODED_SUBNAME,
        labelhash: ENCODED_SUBNAME_LABELHASH,
        owner: CONNECTED,
      },
      { name: `cold.${NAME}`, labelhash: otherLabelhash, owner: CONNECTED },
    ]
    allowedResources = new Set([BigInt(otherLabelhash).toString()])

    renderRoute()

    // Scoped to the desktop table: the mobile card layout renders the same
    // controls again, and both are present in a test DOM.
    const table = await screen.findByRole('table')

    // The permitted row gets a Delete button; the other one does not.
    await waitFor(() =>
      expect(
        within(table).getByRole('button', { name: `Delete cold.${NAME}` }),
      ).toBeInTheDocument(),
    )
    expect(
      within(table).queryByRole('button', {
        name: `Delete ${ENCODED_SUBNAME}`,
      }),
    ).not.toBeInTheDocument()

    // And only the permitted row can be ticked, so "N selected" is always N
    // names Clear can really act on.
    expect(
      within(table).getAllByRole('checkbox', { name: 'Select row' }),
    ).toHaveLength(1)

    await userEvent.click(
      within(table).getByRole('checkbox', { name: 'Select all' }),
    )
    expect(await screen.findByText('1 selected')).toBeInTheDocument()
  })
})
