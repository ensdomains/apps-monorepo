import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { err, ok } from 'neverthrow'
import { type Address, zeroAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestQueryClient } from '@/test-utils/providers'

const CONNECTED: Address = '0x0000000000000000000000000000000000000011'
const PARENT_REGISTRY: Address = '0x00000000000000000000000000000000000000aa'
const LIVE_REGISTRY: Address = '0x00000000000000000000000000000000000000bb'
const CUSTOM_REGISTRY: Address = '0x00000000000000000000000000000000000000cc'

vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi')>()
  return { ...actual, useConnection: () => ({ address: CONNECTED }) }
})

// The name renders as an unconfigured 3LD: its own registry slot is empty and
// `1.sugh003.eth`-style ancestry sits behind it.
vi.mock('@/features/registry/hooks/useNameRegistryDiscovery', () => ({
  getNameRegistriesQueryOptions: ({ name }: { name: string }) => ({
    queryKey: ['nameRegistries', name] as const,
    queryFn: () => [zeroAddress, PARENT_REGISTRY, PARENT_REGISTRY],
  }),
}))

vi.mock('@/features/registry/hooks/useHasRoles', () => ({
  getHasRolesQueryOptions: () => ({
    queryKey: ['hasRoles'] as const,
    queryFn: () => true,
  }),
}))

const readSubregistry = vi.fn()
vi.mock('@/features/registry/helpers/readSubregistry', () => ({
  readSubregistry: (params: unknown) => readSubregistry(params),
}))

const deploySubregistryAsync = vi.fn()
vi.mock('@/features/registry/hooks/useDeploySubregistry', () => ({
  useDeploySubregistry: () => ({
    deploySubregistryAsync,
    isConfirming: false,
    hasWallet: true,
  }),
}))

const setSubregistry = vi.fn()
vi.mock('@/features/registry/hooks/useSetSubregistry', () => ({
  useSetSubregistry: () => ({
    setSubregistry,
    isPending: false,
    isSuccess: false,
    hasWallet: true,
  }),
}))

// Fired after a successful deploy; talks to the block explorer.
vi.mock('@/utils/blockExplorer/verifyProxyContract', () => ({
  verifyProxyContract: vi.fn().mockResolvedValue(undefined),
}))

const openModal = vi.fn()
vi.mock('@/features/transaction-manager/hooks/useTransactionModal', () => ({
  useTransactionModal: () => ({
    openModal,
    closeModal: vi.fn(),
    clearTransaction: vi.fn(),
  }),
}))

// Stands in for the real modal by exposing each transaction's `onStart`, which
// is how the modal drives the writes.
vi.mock('@/features/transaction-manager/components/TransactionModal', () => ({
  TransactionModal: ({
    transactions,
  }: {
    transactions: readonly {
      id: string
      onStart?: () => void | Promise<void>
    }[]
  }) => (
    <>
      {transactions.map((transaction) => (
        <button
          key={transaction.id}
          type="button"
          onClick={() => transaction.onStart?.()}
        >
          start:{transaction.id}
        </button>
      ))}
    </>
  ),
}))

const { ConfigureRegistryForm } = await import('./ConfigureRegistryForm')

const renderForm = () => {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigureRegistryForm name="1.sugh003.eth" />
    </QueryClientProvider>,
  )
}

/** Open the inner `SubregistryConfigurator` form and submit it. */
const submitForm = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(
    await screen.findByRole('button', { name: /configure registry/i }),
  )
  await user.click(screen.getByRole('button', { name: 'Deploy' }))
}

beforeEach(() => {
  readSubregistry.mockReset()
  setSubregistry.mockReset()
  deploySubregistryAsync.mockReset()
  openModal.mockReset()
})

describe('ConfigureRegistryForm', () => {
  it('starts the flow when the name still has no registry', async () => {
    readSubregistry.mockResolvedValue(ok(zeroAddress))
    const user = userEvent.setup()
    renderForm()

    await submitForm(user)

    await waitFor(() => expect(openModal).toHaveBeenCalledOnce())
    expect(readSubregistry).toHaveBeenCalledWith({
      registryAddress: PARENT_REGISTRY,
      label: '1',
    })
  })

  it('refuses to submit once the name has a registry of its own', async () => {
    readSubregistry.mockResolvedValue(ok(LIVE_REGISTRY))
    const user = userEvent.setup()
    renderForm()

    await submitForm(user)

    expect(
      await screen.findByText(/registry already configured/i),
    ).toBeInTheDocument()
    expect(openModal).not.toHaveBeenCalled()
    expect(deploySubregistryAsync).not.toHaveBeenCalled()
    expect(setSubregistry).not.toHaveBeenCalled()
  })

  it('keeps the form and explains itself when the pointer cannot be read', async () => {
    // A failed read must never be taken as "the slot is free".
    readSubregistry.mockResolvedValue(
      err({ cause: new Error('rpc unavailable') }),
    )
    const user = userEvent.setup()
    renderForm()

    await submitForm(user)

    expect(await screen.findByText(/rpc unavailable/i)).toBeInTheDocument()
    expect(openModal).not.toHaveBeenCalled()
    expect(deploySubregistryAsync).not.toHaveBeenCalled()
  })

  it('re-checks between the deploy and the set, refusing a slot filled meanwhile', async () => {
    readSubregistry.mockResolvedValue(ok(zeroAddress))
    deploySubregistryAsync.mockResolvedValue({
      deployedAddress: CUSTOM_REGISTRY,
    })
    const user = userEvent.setup()
    renderForm()

    // Submit passes: the slot is empty when the flow starts.
    await submitForm(user)
    await waitFor(() => expect(openModal).toHaveBeenCalledOnce())

    await user.click(
      screen.getByRole('button', { name: 'start:tx-deploy-subregistry' }),
    )
    await waitFor(() => expect(deploySubregistryAsync).toHaveBeenCalledOnce())

    // Someone configures the registry while the deploy is mining.
    readSubregistry.mockResolvedValue(ok(LIVE_REGISTRY))
    await user.click(
      screen.getByRole('button', { name: 'start:tx-set-subregistry' }),
    )

    expect(
      await screen.findByText(/registry already configured/i),
    ).toBeInTheDocument()
    expect(setSubregistry).not.toHaveBeenCalled()
  })

  it('refuses the pre-existing-registry path too', async () => {
    readSubregistry.mockResolvedValue(ok(LIVE_REGISTRY))
    const user = userEvent.setup()
    renderForm()

    await user.click(
      await screen.findByRole('button', { name: /configure registry/i }),
    )
    await user.click(
      screen.getByLabelText(/use a pre-existing registry contract/i),
    )
    await user.type(
      screen.getByPlaceholderText(/paste contract address/i),
      CUSTOM_REGISTRY,
    )
    await user.click(screen.getByRole('button', { name: 'Deploy' }))

    expect(
      await screen.findByText(/registry already configured/i),
    ).toBeInTheDocument()
    expect(setSubregistry).not.toHaveBeenCalled()
  })
})
