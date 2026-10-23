import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestQueryClient } from '@/test-utils/providers'

const navigate = vi.fn()
const NAME = 'parent.eth'
const CONNECTED: Address = '0x0000000000000000000000000000000000000011'
const OTHER: Address = '0x0000000000000000000000000000000000000022'
const SUBREGISTRY: Address = '0x00000000000000000000000000000000000000bb'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => navigate,
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useParams: () => ({ name: NAME }),
  }),
}))

vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi')>()
  return {
    ...actual,
    useConnection: () => ({ address: CONNECTED, isConnected: true }),
  }
})

vi.mock('@/features/address/components/AddressNameInput', () => ({
  AddressNameInput: () => <input aria-label="owner" />,
}))
vi.mock('@/features/address/hooks/useAddressResolution', () => ({
  useAddressResolution: () => ({ status: 'resolved', address: CONNECTED }),
}))

let protocolVersion: 'ENSv1' | 'ENSv2' = 'ENSv1'
vi.mock('@/features/profile/hooks/useEnsOwner', () => ({
  getEnsOwnerQueryOptions: () => ({
    queryKey: ['ensOwner', NAME, protocolVersion],
    queryFn: () => ({ protocolVersion, owner: CONNECTED }),
  }),
}))

let v1State: Record<string, unknown> | null = null
vi.mock('@/features/transfer/v1/getV1NameState', () => ({
  getV1NameStateQueryOptions: () => ({
    queryKey: ['v1NameState', NAME],
    queryFn: () => v1State,
  }),
}))

vi.mock('@/features/registry/hooks/useNameRegistryDiscovery', () => ({
  getNameRegistriesQueryOptions: () => ({
    queryKey: ['nameRegistries', NAME],
    queryFn: () => [SUBREGISTRY],
  }),
}))

/** How the label lookup answers: never (a slow read), by failing, or with a status. */
let labelLookup: 'pending' | 'error' | 'available' | 'reserved' | 'registered' =
  'pending'
const labelLookupCalls = vi.fn()
vi.mock('@/features/profile/hooks/useSubnames', () => ({
  getSubnameLabelStatusQueryOptions: (params: Record<string, unknown>) => ({
    queryKey: ['subnameLabelStatus', JSON.stringify(params)],
    queryFn: () => {
      labelLookupCalls()
      return match(labelLookup)
        .with('pending', () => new Promise(() => {}))
        .with('error', () => Promise.reject(new Error('rpc down')))
        .otherwise((status) => Promise.resolve(status))
    },
  }),
}))

/** The connected wallet's root roles on the subregistry. */
let rootRoles: readonly string[] = []
const rootRoleReads = vi.fn()
vi.mock('@/features/roles/hooks/useNameRolesForAccount', () => ({
  getNameRolesForAccountQueryOptions: (params: Record<string, unknown>) => ({
    queryKey: ['nameRolesForAccount', String(params.resource)],
    queryFn: () => {
      rootRoleReads(params)
      return { decoded: rootRoles, raw: 0n }
    },
  }),
}))

vi.mock('@/features/registry/hooks/useCreateSubname', () => ({
  useCreateSubname: () => ({
    createSubname: vi.fn(),
    isPending: false,
    isSuccess: false,
  }),
}))
vi.mock('@/features/transaction-manager/components/TransactionModal', () => ({
  TransactionModal: ({
    transactions,
  }: {
    transactions: { onDone: () => void }[]
  }) => (
    <button type="button" onClick={() => transactions[0].onDone()}>
      Complete creation
    </button>
  ),
}))
vi.mock('@/features/transaction-manager/hooks/useTransactionModal', () => ({
  useTransactionModal: () => ({
    openModal: vi.fn(),
    closeModal: vi.fn(),
    clearTransaction: vi.fn(),
  }),
}))

const { Route } = await import('./create-subname')
const CreateSubnameRoute = (
  Route as unknown as { component: () => React.ReactElement }
).component

const renderRoute = () =>
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <CreateSubnameRoute />
    </QueryClientProvider>,
  )

const v1 = (overrides: Record<string, unknown> = {}) => {
  protocolVersion = 'ENSv1'
  v1State = {
    subject: { kind: 'v1-registry', owner: CONNECTED },
    registration: null,
    resolverAddress: null,
    parent: null,
    ancestorRegistration: null,
    ...overrides,
  }
}

beforeEach(() => {
  protocolVersion = 'ENSv1'
  v1State = null
  labelLookup = 'pending'
  labelLookupCalls.mockReset()
  rootRoles = []
  rootRoleReads.mockReset()
})

describe('create subname under a V1 parent', () => {
  it.each([
    [
      'a wallet that does not hold the name',
      { subject: { kind: 'v1-registry', owner: OTHER } },
      'Only its owner can create subnames',
    ],
    [
      'a .eth 2LD in its grace period',
      { subject: null, registration: 'gracePeriod' },
      'This name is in its grace period',
    ],
    // A lapsed emancipated name has no holder at all, not someone else.
    ['a name nobody holds', { subject: null }, 'Nobody holds this name'],
    [
      'a wrapped name that burned CANNOT_CREATE_SUBDOMAIN',
      {
        subject: {
          kind: 'v1-wrapped',
          owner: CONNECTED,
          fuses: {
            cannotTransfer: false,
            cannotSetResolver: false,
            cannotUnwrap: true,
            cannotCreateSubdomain: true,
            parentCannotControl: true,
          },
          expiry: null,
        },
      },
      'Subnames are locked',
    ],
  ])('refuses %s', async (_, state, title) => {
    v1(state)
    renderRoute()

    expect(await screen.findByText(title)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create subname/i })).toBeNull()
  })

  // Protocol terminology: the V1 registry and NameWrapper both call it owner.
  it('labels the new address Owner', async () => {
    v1()
    renderRoute()

    expect(await screen.findByText('Owner')).toBeInTheDocument()
  })

  // setSubnodeRecord would overwrite a subname the lookup has not ruled out.
  it('keeps the submit disabled until the label lookup has answered', async () => {
    v1()
    renderRoute()

    await userEvent.type(await screen.findByLabelText('Subname'), 'sub')

    expect(
      screen.getByRole('button', { name: /create subname/i }),
    ).toBeDisabled()
  })

  it('shows a failed label lookup and retries it', async () => {
    labelLookup = 'error'
    v1()
    renderRoute()

    await userEvent.type(await screen.findByLabelText('Subname'), 'sub')
    expect(
      await screen.findByText(/could not check whether sub\.parent\.eth/i),
    ).toBeInTheDocument()
    const callsBeforeRetry = labelLookupCalls.mock.calls.length

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(labelLookupCalls.mock.calls.length).toBeGreaterThan(callsBeforeRetry)
  })
})

describe('create subname under a V2 parent', () => {
  const typeLabel = async () =>
    userEvent.type(await screen.findByLabelText('Subname'), 'sub')
  const submit = () => screen.getByRole('button', { name: /create subname/i })

  beforeEach(() => {
    protocolVersion = 'ENSv2'
  })

  it('refuses a wallet with neither registrar role on the subregistry root', async () => {
    rootRoles = ['ROLE_UNREGISTER']
    renderRoute()

    expect(
      await screen.findByText('You can’t create subnames here'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Subname')).toBeNull()
    expect(rootRoleReads).toHaveBeenCalledWith(
      expect.objectContaining({ registryAddress: SUBREGISTRY, resource: 0n }),
    )
  })

  it('keeps the submit disabled until the label lookup has answered', async () => {
    rootRoles = ['ROLE_REGISTRAR']
    renderRoute()

    await typeLabel()

    expect(screen.getByText('Owner')).toBeInTheDocument()
    expect(submit()).toBeDisabled()
  })

  it('lets a registrar create an available label', async () => {
    rootRoles = ['ROLE_REGISTRAR']
    labelLookup = 'available'
    renderRoute()

    await typeLabel()

    await waitFor(() => expect(submit()).toBeEnabled())
  })

  it('refuses a reserved label to a wallet without ROLE_REGISTER_RESERVED', async () => {
    rootRoles = ['ROLE_REGISTRAR']
    labelLookup = 'reserved'
    renderRoute()

    await typeLabel()

    expect(
      await screen.findByText(/sub\.parent\.eth is reserved/),
    ).toBeInTheDocument()
    expect(submit()).toBeDisabled()
  })

  it('lets a reserved-registration holder promote a reserved label, and only that', async () => {
    rootRoles = ['ROLE_REGISTER_RESERVED']
    labelLookup = 'reserved'
    const { unmount } = renderRoute()

    await typeLabel()
    await waitFor(() => expect(submit()).toBeEnabled())
    unmount()

    labelLookup = 'available'
    renderRoute()
    await typeLabel()

    expect(
      await screen.findByText(/can only register reserved labels/),
    ).toBeInTheDocument()
    expect(submit()).toBeDisabled()
  })

  it('says a registered label is taken', async () => {
    rootRoles = ['ROLE_REGISTRAR']
    labelLookup = 'registered'
    renderRoute()

    await typeLabel()

    expect(
      await screen.findByText('sub.parent.eth is already registered.'),
    ).toBeInTheDocument()
    expect(submit()).toBeDisabled()
  })
})

it('opens the newly created child profile after completion', async () => {
  protocolVersion = 'ENSv2'
  rootRoles = ['ROLE_REGISTRAR']
  labelLookup = 'available'
  renderRoute()
  await userEvent.type(await screen.findByLabelText('Subname'), 'child')
  await userEvent.click(
    screen.getByRole('button', { name: 'Complete creation' }),
  )
  expect(navigate).toHaveBeenCalledWith({
    to: '/$name',
    params: { name: 'child.parent.eth' },
  })
})
