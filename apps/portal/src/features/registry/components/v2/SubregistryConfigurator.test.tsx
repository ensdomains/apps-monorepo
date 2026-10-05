import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type Address, zeroAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestQueryClient } from '@/test-utils/providers'

const CHECKSUMMED = '0x801D2e48d378F161Dba7AD7ad002Ad557714c191'

const PARENT_REGISTRY: Address = '0x00000000000000000000000000000000000000aa'
// A first label in `[<64 hex>]` form, so its id has to be read from the registry.
const ENCODED_NAME = `[${'ab'.repeat(32)}].sugh003.eth`
const READ_RESOURCE_ID = 42n
const CONNECTED: Address = '0x00000000000000000000000000000000000000cc'

vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi')>()
  return { ...actual, useConnection: () => ({ address: CONNECTED }) }
})

const discoverRegistries = vi.fn()
vi.mock('@/features/registry/hooks/useNameRegistryDiscovery', () => ({
  getNameRegistriesQueryOptions: ({ name }: { name: string }) => ({
    queryKey: ['nameRegistries', name] as const,
    queryFn: () => discoverRegistries(),
  }),
}))

const readResourceId = vi.fn()
vi.mock('@/features/registry/hooks/useNameResourceId', () => ({
  getNameResourceIdQueryOptions: (params: {
    name: string
    registryAddress: Address | undefined
  }) => ({
    queryKey: ['nameResourceId', params] as const,
    queryFn: () => readResourceId(params),
  }),
}))

vi.mock('@/features/registry/hooks/useDeploySubregistry', () => ({
  useDeploySubregistry: () => ({
    deploySubregistryAsync: vi.fn(),
    isConfirming: false,
    hasWallet: true,
  }),
}))

// Records the id every write would be addressed with.
const useSetSubregistryParams = vi.fn()
vi.mock('@/features/registry/hooks/useSetSubregistry', () => ({
  useSetSubregistry: (params: unknown) => {
    useSetSubregistryParams(params)
    return {
      setSubregistry: vi.fn(),
      isPending: false,
      isSuccess: false,
      hasWallet: true,
    }
  },
}))

vi.mock('@/utils/blockExplorer/verifyProxyContract', () => ({
  verifyProxyContract: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/features/transaction-manager/hooks/useTransactionModal', () => ({
  useTransactionModal: () => ({
    openModal: vi.fn(),
    closeModal: vi.fn(),
    clearTransaction: vi.fn(),
  }),
}))

vi.mock('@/features/transaction-manager/components/TransactionModal', () => ({
  TransactionModal: () => null,
}))

const { getCustomRegistryAddressError, SubregistryConfigurator } = await import(
  './SubregistryConfigurator'
)

const renderConfigurator = (name = ENCODED_NAME) =>
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <SubregistryConfigurator
        name={name}
        onCancel={vi.fn()}
        assertWritable={null}
      />
    </QueryClientProvider>,
  )

/** A promise the test settles when it chooses. */
const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

beforeEach(() => {
  discoverRegistries
    .mockReset()
    .mockResolvedValue([zeroAddress, PARENT_REGISTRY, PARENT_REGISTRY])
  readResourceId.mockReset().mockResolvedValue(READ_RESOURCE_ID)
  useSetSubregistryParams.mockReset()
})

describe('SubregistryConfigurator', () => {
  it('shows registry discovery loading on its own, before asking for an id', async () => {
    discoverRegistries.mockReturnValue(new Promise(() => {}))
    renderConfigurator()

    expect(
      await screen.findByText('Loading registry information'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Identifying this name')).not.toBeInTheDocument()
    expect(readResourceId).not.toHaveBeenCalled()
  })

  it('shows a registry discovery failure as such, without asking for an id', async () => {
    discoverRegistries.mockRejectedValue(new Error('rpc down'))
    renderConfigurator()

    expect(
      await screen.findByText(/error fetching registry data/i),
    ).toBeInTheDocument()
    expect(readResourceId).not.toHaveBeenCalled()
  })

  it('shows identifying the name as its own step once the registry is known', async () => {
    readResourceId.mockReturnValue(new Promise(() => {}))
    renderConfigurator()

    expect(await screen.findByText('Identifying this name')).toBeInTheDocument()
    expect(
      screen.queryByText('Loading registry information'),
    ).not.toBeInTheDocument()
    expect(readResourceId).toHaveBeenCalledWith({
      name: ENCODED_NAME,
      registryAddress: PARENT_REGISTRY,
    })
  })

  it('shows a failed id read distinctly from a registry failure, with a retry', async () => {
    readResourceId.mockRejectedValueOnce(new Error('multicall reverted'))
    const user = userEvent.setup()
    renderConfigurator()

    expect(
      await screen.findByText(
        /could not be asked which name .* is, so nothing was loaded: multicall reverted/,
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/error fetching registry data/i),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deploy' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(
      await screen.findByRole('button', { name: 'Deploy' }),
    ).toBeInTheDocument()
    expect(readResourceId).toHaveBeenCalledTimes(2)
  })

  it('builds no write until the id resolves, then addresses it with that id', async () => {
    const id = deferred<bigint>()
    readResourceId.mockReturnValue(id.promise)
    renderConfigurator()

    await screen.findByText('Identifying this name')
    expect(screen.queryByRole('button', { name: 'Deploy' })).toBeNull()
    expect(useSetSubregistryParams).not.toHaveBeenCalled()

    id.resolve(READ_RESOURCE_ID)

    expect(
      await screen.findByRole('button', { name: 'Deploy' }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(useSetSubregistryParams).toHaveBeenCalledWith(
        expect.objectContaining({ resourceId: READ_RESOURCE_ID }),
      ),
    )
    for (const [params] of useSetSubregistryParams.mock.calls)
      expect(params).toMatchObject({ resourceId: READ_RESOURCE_ID })
  })

  it('skips the id read for a name whose id comes from its label', async () => {
    renderConfigurator('1.sugh003.eth')

    expect(
      await screen.findByRole('button', { name: 'Deploy' }),
    ).toBeInTheDocument()
    expect(readResourceId).not.toHaveBeenCalled()
  })
})

describe('getCustomRegistryAddressError', () => {
  it('accepts a checksummed address, and either all-lower or all-upper case', () => {
    expect(getCustomRegistryAddressError(CHECKSUMMED)).toBeNull()
    expect(getCustomRegistryAddressError(CHECKSUMMED.toLowerCase())).toBeNull()
  })

  it('says nothing about an empty field', () => {
    expect(getCustomRegistryAddressError('')).toBeNull()
  })

  it('calls out a checksum mismatch as a typo, not a bad address', () => {
    // Same address with the last character changed: well formed, wrong checksum.
    expect(
      getCustomRegistryAddressError(
        '0x801D2e48d378F161Dba7AD7ad002Ad557714c194',
      ),
    ).toMatch(/checksum/)
  })

  it('rejects anything that is not an address at all', () => {
    for (const value of ['0x801D2e48', 'not-an-address', `${CHECKSUMMED}00`]) {
      expect(getCustomRegistryAddressError(value)).toBe(
        'Enter a valid contract address.',
      )
    }
  })
})
