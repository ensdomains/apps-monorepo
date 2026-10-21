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

let protocolVersion: 'ENSv1' | 'ENSv2' = 'ENSv2'
vi.mock('@/features/profile/hooks/useEnsOwner', () => ({
  getEnsOwnerQueryOptions: () => ({
    queryKey: ['ensOwner', NAME, protocolVersion],
    queryFn: () => ({ protocolVersion, owner: CONNECTED }),
  }),
}))

// Served as `initialData`, so the gate is settled on the first render and a
// missing Create link can't just mean "not read yet". `null` fails the read.
let v1State: Record<string, unknown> | null = null
vi.mock('@/features/transfer/v1/getV1NameState', () => ({
  getV1NameStateQueryOptions: () => ({
    queryKey: ['v1NameState', NAME],
    queryFn: () => Promise.reject(new Error('rpc down')),
    ...(v1State ? { initialData: v1State } : {}),
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
  getSubnamePagesQueryOptions: () => ({
    queryKey: ['subnames', NAME],
    queryFn: () => ({ subnames, totalCount: subnames.length }),
    initialPageParam: 0,
    getNextPageParam: () => undefined,
  }),
  getV1SubnamesQueryOptions: () => ({
    queryKey: ['v1Subnames', NAME],
    queryFn: () => ({ subnames: [], hasNextPage: false }),
    initialPageParam: undefined,
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

/** The connected account's roles on the subregistry ROOT, which gate creation. */
let rootRoles: readonly string[] = ['ROLE_REGISTRAR']
const rootRoleParams = vi.fn()
vi.mock(
  '@/features/roles/hooks/useNameRolesForAccount',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/features/roles/hooks/useNameRolesForAccount')
    >()),
    getNameRolesForAccountQueryOptions: (params: Record<string, unknown>) => {
      rootRoleParams(params)
      return {
        queryKey: [
          'nameRolesForAccount',
          String(params.registryAddress),
          String(params.resource),
        ],
        queryFn: () => ({ decoded: rootRoles, raw: 0n }),
      }
    },
  }),
)

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

vi.mock('@/features/registry/hooks/useDeleteV1Subname', () => ({
  useDeleteV1Subname: () => ({
    checkAsync: vi.fn(),
    isChecking: false,
    deleteStepAsync: vi.fn(),
    isDeleting: false,
    error: null,
  }),
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
  rootRoleParams.mockReset()
  rootRoles = ['ROLE_REGISTRAR']
  resourceRolesParams.mockReset()
  resourceRolesFetched.mockReset()
  subnames = []
  hasRootUnregister = false
  allowedResources = null
  protocolVersion = 'ENSv2'
  v1State = null
})

describe('V1 subname creation', () => {
  const v1 = (subject: Record<string, unknown>) => {
    protocolVersion = 'ENSv1'
    v1State = {
      subject,
      registration: null,
      resolverAddress: null,
      parent: null,
      ancestorRegistration: null,
    }
  }
  const wrapped = (cannotCreateSubdomain: boolean) => ({
    kind: 'v1-wrapped',
    owner: CONNECTED,
    fuses: {
      cannotTransfer: false,
      cannotSetResolver: false,
      cannotUnwrap: cannotCreateSubdomain,
      cannotCreateSubdomain,
      parentCannotControl: cannotCreateSubdomain,
    },
    expiry: null,
  })
  const createLink = () =>
    screen.queryByRole('link', { name: /create subname/i })

  it('offers subname creation to the holder of an unwrapped name', async () => {
    v1({ kind: 'v1-registry', owner: CONNECTED })
    renderRoute()

    await screen.findByText(/no subnames yet/i)
    expect(createLink()).toBeInTheDocument()
  })

  it('offers subname creation to the owner of a wrapped name', async () => {
    v1(wrapped(false))
    renderRoute()

    await screen.findByText(/no subnames yet/i)
    expect(createLink()).toBeInTheDocument()
  })

  it('offers nothing when the wrapped name burned CANNOT_CREATE_SUBDOMAIN', async () => {
    v1(wrapped(true))
    renderRoute()

    await screen.findByText(/no subnames yet/i)
    expect(createLink()).not.toBeInTheDocument()
  })

  it('offers nothing to an account that does not hold the name', async () => {
    v1({ kind: 'v1-registry', owner: PARENT_REGISTRY })
    renderRoute()

    await screen.findByText(/no subnames yet/i)
    expect(createLink()).not.toBeInTheDocument()
  })

  it('says so when it could not check, rather than just hiding the link', async () => {
    protocolVersion = 'ENSv1'
    renderRoute()

    expect(
      await screen.findByText(
        /couldn’t check whether you can create or delete subnames/i,
      ),
    ).toBeInTheDocument()
    expect(createLink()).not.toBeInTheDocument()
  })
})

describe('V1 subname deletion', () => {
  const holdUnwrapped = (owner: string) => {
    protocolVersion = 'ENSv1'
    v1State = {
      subject: { kind: 'v1-registry', owner },
      registration: null,
      resolverAddress: null,
      parent: null,
      ancestorRegistration: null,
    }
  }
  const v1Row = (label: string, subnameCount: number) => ({
    name: `${label}.${NAME}`,
    labelName: label,
    labelhash: labelhash(label),
    owner: PARENT_REGISTRY,
    v1Wrapping: { isWrapped: false },
    subnameCount,
  })

  it('offers the holder a delete, and says why a subname with subnames has none', async () => {
    holdUnwrapped(CONNECTED)
    subnames = [v1Row('leaf', 0), v1Row('branch', 2)]
    renderRoute()

    expect(
      (await screen.findAllByRole('button', { name: `Delete leaf.${NAME}` }))
        .length,
    ).toBeGreaterThan(0)
    expect(
      screen.queryByRole('button', { name: `Delete branch.${NAME}` }),
    ).not.toBeInTheDocument()
    expect(
      screen.getAllByLabelText(/can’t delete branch\..*delete those first/i)
        .length,
    ).toBeGreaterThan(0)
  })

  it('offers nothing to an account that does not hold the name', async () => {
    holdUnwrapped(PARENT_REGISTRY)
    subnames = [v1Row('leaf', 0)]
    renderRoute()

    await screen.findAllByText(`leaf.${NAME}`)
    expect(
      screen.queryByRole('button', { name: /delete/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/can’t delete/i)).not.toBeInTheDocument()
  })
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

    for (const params of subregistryCalls()) {
      expect(params).not.toHaveProperty('label')
    }

    // The create gate reads the caller's roles on the subregistry's ROOT.
    await waitFor(() =>
      expect(rootRoleParams).toHaveBeenCalledWith(
        expect.objectContaining({ registryAddress: SUBREGISTRY, resource: 0n }),
      ),
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

  // A reserved label is registered under ROLE_REGISTER_RESERVED alone.
  it('offers subname creation to a reserved-registration holder', async () => {
    rootRoles = ['ROLE_REGISTER_RESERVED']
    renderRoute()

    expect(
      await screen.findByRole('link', { name: /create subname/i }),
    ).toBeInTheDocument()
  })

  it('offers no subname creation without either registrar role', async () => {
    rootRoles = ['ROLE_UNREGISTER']
    subnames = [
      { name: `cold.${NAME}`, labelhash: labelhash('cold'), owner: CONNECTED },
    ]
    renderRoute()

    await screen.findByRole('table')
    await waitFor(() => expect(rootRoleParams).toHaveBeenCalled())
    expect(
      screen.queryByRole('link', { name: /create subname/i }),
    ).not.toBeInTheDocument()
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
