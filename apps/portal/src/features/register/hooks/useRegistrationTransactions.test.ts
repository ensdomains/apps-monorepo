// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fromPromise } from 'xstate'

const ACCOUNT = '0x1111111111111111111111111111111111111111' as Address
const USDC = '0x2222222222222222222222222222222222222222' as Address

const closeModal = vi.fn()

vi.mock('@ens-apps/transaction-manager', async () => {
  const actual = await vi.importActual<
    typeof import('@ens-apps/transaction-manager')
  >('@ens-apps/transaction-manager')
  return {
    ...actual,
    // Park the EOA flow at its first on-chain step: the name is already
    // captured in context, and nothing reaches a wallet or RPC.
    registrationMachine: actual.registrationMachine.provide({
      actors: {
        deployResolver: fromPromise(() => new Promise(() => {})) as never,
      },
    }),
  }
})

vi.mock('wagmi', async () => ({
  ...(await vi.importActual<typeof import('wagmi')>('wagmi')),
  useConfig: () => ({}),
  useConnection: () => ({ address: ACCOUNT }),
  usePublicClient: () => ({}),
  useReadContract: () => ({ data: undefined }),
}))

vi.mock('@wagmi/core/actions', () => ({
  getWalletClient: async () => ({ account: { address: ACCOUNT } }),
}))

vi.mock('@/features/registry/utils/signer.helpers', () => ({
  createEOASigner: () => ({ type: 'eoa' }),
}))

vi.mock('@/utils/blockExplorer/verifyProxyContract', () => ({
  verifyProxyContract: async () => {},
}))

vi.mock('@/features/register/utils/tokenLookup', () => ({
  getTokenMetadataWithAddress: () => ({ symbol: 'USDC', decimals: 6 }),
}))

vi.mock('@/features/transaction-manager/hooks/useTransactionModal', () => ({
  useTransactionModal: () => ({ closeModal, clearTransaction: () => {} }),
}))

const { useRegistrationTransactions } = await import(
  './useRegistrationTransactions'
)

const renderRegistration = (name: string) =>
  renderHook(
    ({ name }) => useRegistrationTransactions({ name, duration: 31_536_000 }),
    { initialProps: { name } },
  )

/** Pick a token, then run the first modal step exactly as the modal would. */
const startRegistration = async (
  result: ReturnType<typeof renderRegistration>['result'],
) => {
  act(() => result.current.startFlow(USDC, 160_000_000n))
  await act(() => result.current.transactions[0].onStart?.())
}

describe('useRegistrationTransactions — name binding', () => {
  beforeEach(() => {
    closeModal.mockClear()
  })

  it('cancels a live flow for A when the page switches to B', async () => {
    const { result, rerender } = renderRegistration('expensive.eth')
    await startRegistration(result)

    const { actor } = result.current
    expect(actor.getSnapshot().value).toBe('deployingResolver')
    expect(actor.getSnapshot().context.name).toBe('expensive.eth')

    rerender({ name: 'cheap.eth' })

    // The flow still bound to A must not survive under B's labels: its
    // register step would otherwise pay for A while the page shows B.
    await waitFor(() => expect(actor.getSnapshot().value).toBe('idle'))
    expect(closeModal).toHaveBeenCalled()
    expect(result.current.isRegistering).toBe(false)
  })

  it('binds a restarted flow to the name the page now shows', async () => {
    const { result, rerender } = renderRegistration('expensive.eth')
    await startRegistration(result)

    rerender({ name: 'cheap.eth' })
    await waitFor(() =>
      expect(result.current.actor.getSnapshot().value).toBe('idle'),
    )

    await startRegistration(result)

    expect(result.current.actor.getSnapshot().context.name).toBe('cheap.eth')
    expect(result.current.isRegistering).toBe(true)
  })

  it('leaves an in-flight flow alone while the name is unchanged', async () => {
    const { result, rerender } = renderRegistration('expensive.eth')
    await startRegistration(result)

    rerender({ name: 'expensive.eth' })

    expect(result.current.actor.getSnapshot().value).toBe('deployingResolver')
    expect(closeModal).not.toHaveBeenCalled()
  })
})
