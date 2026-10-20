import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestQueryClient } from '@/test-utils/providers'

const NAME = 'parent.eth'
const CONNECTED: Address = '0x0000000000000000000000000000000000000011'
const OTHER: Address = '0x0000000000000000000000000000000000000022'
const SUBREGISTRY: Address = '0x00000000000000000000000000000000000000bb'

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

/** How the label lookup answers: never (a slow read), or by failing. */
let labelLookup: 'pending' | 'error' = 'pending'
const labelLookupCalls = vi.fn()
vi.mock('@/features/profile/hooks/useSubnames', () => ({
  getIsSubnameTakenQueryOptions: (params: Record<string, unknown>) => ({
    queryKey: ['isSubnameTaken', JSON.stringify(params)],
    queryFn: () => {
      labelLookupCalls()
      return labelLookup === 'error'
        ? Promise.reject(new Error('rpc down'))
        : new Promise(() => {})
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
  TransactionModal: () => null,
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
  it('still lets the submit through while the label lookup is pending', async () => {
    protocolVersion = 'ENSv2'
    renderRoute()

    await userEvent.type(await screen.findByLabelText('Subname'), 'sub')

    expect(screen.getByText('Owner')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /create subname/i }),
    ).toBeEnabled()
  })
})
