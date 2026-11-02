import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ok } from 'neverthrow'
import { type Address, zeroAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestQueryClient } from '@/test-utils/providers'

const CONNECTED: Address = '0x0000000000000000000000000000000000000011'
const PARENT_REGISTRY: Address = '0x00000000000000000000000000000000000000aa'
const PREVIOUS_REGISTRY: Address = '0x00000000000000000000000000000000000000bb'
const LIVE_REGISTRY: Address = '0x00000000000000000000000000000000000000cc'

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

const toastWarning = vi.fn()
vi.mock('sonner', () => ({
  toast: { warning: (...args: unknown[]) => toastWarning(...args) },
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

const setSubregistry = vi.fn()
vi.mock('@/features/registry/hooks/useSetSubregistry', () => ({
  useSetSubregistry: () => ({ setSubregistry }),
}))

const openModal = vi.fn()
const closeModal = vi.fn()
vi.mock('@/features/transaction-manager/hooks/useTransactionModal', () => ({
  useTransactionModal: () => ({
    openModal,
    closeModal,
    clearTransaction: vi.fn(),
  }),
}))

vi.mock('@/features/transaction-manager/hooks/useFlowAttempt', () => ({
  useFlowAttempt: () => ({
    scope: { account: CONNECTED.toLowerCase(), nonce: 'scope1' },
    start: openModal,
    end: vi.fn(),
  }),
}))

// Exposes each step's `onStart`, which is how the modal drives the write.
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

const { RestorePreviousRegistry } = await import('./RestorePreviousRegistry')

const run = () => {
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RestorePreviousRegistry
        name="foo.eth"
        previousRegistry={PREVIOUS_REGISTRY}
      />
    </QueryClientProvider>,
  )
  return {
    restore: async () =>
      user.click(
        await screen.findByRole('button', {
          name: /restore previous registry/i,
        }),
      ),
    startWrite: async () =>
      user.click(screen.getByRole('button', { name: /^start:/ })),
  }
}

beforeEach(() => {
  discoverRegistries
    .mockReset()
    .mockResolvedValue([zeroAddress, PARENT_REGISTRY, PARENT_REGISTRY])
  toastWarning.mockReset()
  readSubregistry.mockReset()
  setSubregistry.mockReset()
  openModal.mockReset()
  closeModal.mockReset()
})

/** Restore into an empty slot, up to the write. */
const restoreIntoEmptySlot = async () => {
  readSubregistry.mockResolvedValue(ok(zeroAddress))
  const { restore, startWrite } = run()
  await restore()
  await waitFor(() => expect(openModal).toHaveBeenCalledOnce())
  await startWrite()
}

describe('RestorePreviousRegistry', () => {
  it('points the name back at the previous registry while its slot is empty', async () => {
    await restoreIntoEmptySlot()

    await waitFor(() => expect(setSubregistry).toHaveBeenCalledOnce())
    expect(setSubregistry.mock.calls[0]?.[0]).toBe(PREVIOUS_REGISTRY)
    expect(readSubregistry).toHaveBeenCalledWith({
      registryAddress: PARENT_REGISTRY,
      label: 'foo',
    })
  })

  // The refetch a landed restore triggers unmounts this view, and with it the
  // modal's Done, so the shared modal must not be left open behind it.
  it('closes the shared modal as soon as the restore lands', async () => {
    setSubregistry.mockImplementation(
      (_registry: Address, options?: { onSuccess?: () => void }) =>
        options?.onSuccess?.(),
    )
    await restoreIntoEmptySlot()

    await waitFor(() => expect(closeModal).toHaveBeenCalledOnce())
  })

  it('refuses to restore over a registry configured since the page loaded', async () => {
    readSubregistry.mockResolvedValue(ok(LIVE_REGISTRY))
    const { restore } = run()

    await restore()

    await waitFor(() => expect(toastWarning).toHaveBeenCalledOnce())
    expect(openModal).not.toHaveBeenCalled()
    expect(setSubregistry).not.toHaveBeenCalled()
  })

  it('explains, rather than going blank, when the parent registry is unknown', async () => {
    discoverRegistries.mockResolvedValue([
      zeroAddress,
      zeroAddress,
      zeroAddress,
    ])
    run()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /restore previous registry/i }),
    ).not.toBeInTheDocument()
  })

  it('re-checks before the write, refusing a slot filled meanwhile', async () => {
    readSubregistry
      .mockResolvedValueOnce(ok(zeroAddress))
      .mockResolvedValue(ok(LIVE_REGISTRY))
    const { restore, startWrite } = run()

    await restore()
    await waitFor(() => expect(openModal).toHaveBeenCalledOnce())
    await startWrite()

    await waitFor(() => expect(toastWarning).toHaveBeenCalledOnce())
    expect(setSubregistry).not.toHaveBeenCalled()
  })
})
