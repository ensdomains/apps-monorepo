import { act, renderHook, waitFor } from '@testing-library/react'
import { ResultAsync } from 'neverthrow'
import { type Address, decodeFunctionData, erc1155Abi, getAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestWrapper } from '@/test-utils/providers'
import { TEST_ACCOUNTS } from '@/test-utils/wagmi.mock'

const REGISTRY = '0x1111111111111111111111111111111111111111' as Address
// Checksummed, as the calldata decoder hands addresses back.
const RECIPIENT_A = getAddress(TEST_ACCOUNTS.bob)
const RECIPIENT_B = getAddress(TEST_ACCOUNTS.charlie)
const TOKEN_ID = 42n

const openModal = vi.fn()
vi.mock('@/features/transaction-manager/hooks/useTransactionModal', () => ({
  useTransactionModal: () => ({
    openModal,
    closeModal: vi.fn(),
    clearTransaction: vi.fn(),
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('@wagmi/core/actions', () => ({
  getWalletClient: async () => ({
    account: { address: TEST_ACCOUNTS.alice },
    chain: { id: 11155111 },
  }),
}))

// The preflight is the same estimate the modal runs; not under test here.
vi.mock(
  '@/features/transaction-manager/hooks/useTransactionGasEstimate',
  () => ({
    estimateGasForCall: async () => 21_000n,
    isRevertError: () => false,
  }),
)

vi.mock('../queries/getOwnResolver', () => ({
  getOwnResolverQueryOptions: () => ({
    queryKey: ['transfer-own-resolver-test'],
    queryFn: async () => null,
  }),
}))

/**
 * Every `getEnsTokenId` call hands back a promise the test settles by hand, so
 * a run can be held pending while the form "changes" underneath it.
 */
const pendingTokenIdReads: Array<(tokenId: bigint) => void> = []
vi.mock('@/features/profile/hooks/useTokenId', () => ({
  getEnsTokenId: () =>
    ResultAsync.fromSafePromise(
      new Promise<bigint>((resolve) => {
        pendingTokenIdReads.push(resolve)
      }),
    ),
}))

const { useTransferName } = await import('./useTransferName')

const render = () =>
  renderHook(
    () =>
      useTransferName({
        name: 'foo.eth',
        account: TEST_ACCOUNTS.alice,
        subject: { kind: 'v2', registryAddress: REGISTRY },
      }),
    { wrapper: createTestWrapper() },
  )

const NO_OPTIONS = {
  setEthAddress: false,
  detachResolver: false,
  detachRegistry: false,
} as const

const settleTokenIdRead = async (index: number) => {
  const resolve = pendingTokenIdReads[index]
  if (!resolve) throw new Error(`no token id read #${index} in flight`)
  await act(async () => {
    resolve(TOKEN_ID)
  })
}

/** The recipient encoded into the move step's `safeTransferFrom` calldata. */
const encodedRecipient = (
  transactions: ReturnType<typeof useTransferName>['transactions'],
) => {
  const move = transactions.at(-1)
  const intent = move?.intent?.prepare?.({
    walletClient: { account: { address: TEST_ACCOUNTS.alice } } as never,
    chainId: 11155111,
  })
  if (intent?.request.type !== 'eoa' || !intent.request.data)
    throw new Error('expected an eoa intent with calldata')
  const { functionName, args } = decodeFunctionData({
    abi: erc1155Abi,
    data: intent.request.data,
  })
  if (functionName !== 'safeTransferFrom')
    throw new Error(`expected safeTransferFrom, got ${functionName}`)
  return args[1]
}

describe('useTransferName preparation runs', () => {
  beforeEach(() => {
    openModal.mockClear()
    pendingTokenIdReads.length = 0
  })

  it('opens the modal with the recipient it was started with', async () => {
    const { result } = render()

    act(() => {
      result.current.startTransfer({
        recipient: RECIPIENT_A,
        options: NO_OPTIONS,
      })
    })
    await waitFor(() => expect(pendingTokenIdReads).toHaveLength(1))
    await settleTokenIdRead(0)

    await waitFor(() => expect(openModal).toHaveBeenCalledTimes(1))
    expect(result.current.isPreparing).toBe(false)
    expect(result.current.transactions.at(-1)?.details).toEqual([
      { label: 'To', value: RECIPIENT_A },
    ])
    expect(encodedRecipient(result.current.transactions)).toBe(RECIPIENT_A)
  })

  // Immunefi #91822: the recipient was edited while the token id read was
  // pending, and the stale run opened the modal with the replaced address.
  it('discards a run whose form values changed while it was pending', async () => {
    const { result } = render()

    act(() => {
      result.current.startTransfer({
        recipient: RECIPIENT_A,
        options: NO_OPTIONS,
      })
    })
    await waitFor(() => expect(pendingTokenIdReads).toHaveLength(1))

    act(() => {
      result.current.discardPreparation()
    })
    await settleTokenIdRead(0)

    await waitFor(() => expect(result.current.isPreparing).toBe(false))
    expect(openModal).not.toHaveBeenCalled()
    expect(result.current.transactions).toEqual([])

    // A fresh start from the corrected value is what reaches the modal.
    act(() => {
      result.current.startTransfer({
        recipient: RECIPIENT_B,
        options: NO_OPTIONS,
      })
    })
    await waitFor(() => expect(pendingTokenIdReads).toHaveLength(2))
    await settleTokenIdRead(1)

    await waitFor(() => expect(openModal).toHaveBeenCalledTimes(1))
    expect(encodedRecipient(result.current.transactions)).toBe(RECIPIENT_B)
  })

  it('lets the latest of two overlapping starts win, whatever order they settle', async () => {
    const { result } = render()

    act(() => {
      result.current.startTransfer({
        recipient: RECIPIENT_A,
        options: NO_OPTIONS,
      })
    })
    await waitFor(() => expect(pendingTokenIdReads).toHaveLength(1))
    act(() => {
      result.current.startTransfer({
        recipient: RECIPIENT_B,
        options: NO_OPTIONS,
      })
    })
    await waitFor(() => expect(pendingTokenIdReads).toHaveLength(2))

    // The newer run lands first, then the stale one tries to overwrite it.
    await settleTokenIdRead(1)
    await waitFor(() => expect(openModal).toHaveBeenCalledTimes(1))
    await settleTokenIdRead(0)

    await waitFor(() => expect(result.current.isPreparing).toBe(false))
    expect(openModal).toHaveBeenCalledTimes(1)
    expect(encodedRecipient(result.current.transactions)).toBe(RECIPIENT_B)
  })

  it('drops an already-prepared plan when the form is edited afterwards', async () => {
    const { result } = render()

    act(() => {
      result.current.startTransfer({
        recipient: RECIPIENT_A,
        options: NO_OPTIONS,
      })
    })
    await waitFor(() => expect(pendingTokenIdReads).toHaveLength(1))
    await settleTokenIdRead(0)
    await waitFor(() => expect(result.current.transactions).toHaveLength(1))

    act(() => {
      result.current.discardPreparation()
    })
    expect(result.current.transactions).toEqual([])
  })
})
