import {
  buildRegistrationRecord,
  type EOASigner,
  REGISTRATION_TX_IDS,
  type Signer,
  type TransactionRequest,
  transactionManager,
} from '@ens-apps/transaction-manager'
import { act, renderHook } from '@testing-library/react'
import {
  type Address,
  createWalletClient,
  custom,
  type Hash,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  toHex,
} from 'viem'
import { sepolia } from 'viem/chains'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useBytecode } from 'wagmi'
import { waitFor } from 'xstate'
import { PAYMENT_TOKENS } from '../constants/paymentTokens'
import { useRegistrationTransactions } from './useRegistrationTransactions'

const OWNER = '0x1111111111111111111111111111111111111111' as Address

// Chain reads never answer, so a resumed run stays in its on-chain check.
const pending = () => new Promise<never>(() => {})
const publicClient = { chain: { id: 11155111 }, request: vi.fn(pending) }
const stableConfig = {}

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConfig: () => stableConfig,
  useConnection: () => ({ address: OWNER }),
  usePublicClient: () => publicClient,
  useReadContract: () => ({ data: undefined }),
  // No code at the wallet's resolver address unless a test says otherwise.
  useBytecode: vi.fn(() => ({ data: null, isSuccess: true })),
}))
vi.mock('@/features/transaction-manager/hooks/useTransactionModal', () => ({
  useTransactionModal: () => ({
    closeModal: vi.fn(),
    clearTransaction: vi.fn(),
  }),
}))
vi.mock('@/utils/blockExplorer/verifyProxyContract', () => ({
  verifyProxyContract: vi.fn(),
}))

const resumeAtCommitPrompt = (
  commitmentOnChain: boolean,
  approvalNeeded = true,
) => {
  const { result } = renderHook(() =>
    useRegistrationTransactions({ name: 'leon.eth', duration: 31_536_000 }),
  )
  // Stored while the commit prompt was open: the commitment exists, but
  // nothing says it was sent.
  const record = buildRegistrationRecord(
    'waitingForCommitment',
    {
      chainId: 11155111,
      name: 'leon.eth',
      duration: 31_536_000n,
      selectedToken: 'USDC',
      tokenPrice: 5_000_000n,
      signer: { type: 'eoa' } as unknown as Signer,
      accountAddress: OWNER,
      ownerAddress: OWNER,
      resolverAddress: '0xbbbb000000000000000000000000000000000002',
      commitment: {
        commitment: `0x${'ab'.repeat(32)}` as Hash,
        secret: `0x${'cd'.repeat(32)}` as Hex,
      },
      commitmentTxId: REGISTRATION_TX_IDS.commit,
    },
    1,
  )

  act(() => {
    result.current.resumeFlow({
      record,
      token: PAYMENT_TOKENS[0],
      signer: { type: 'eoa', walletClient: {} } as never,
      commitmentOnChain,
      approvalNeeded,
    })
  })

  return result
}

describe('useRegistrationTransactions after a resume', () => {
  it('keeps the commit step while the commitment is not on-chain', () => {
    // A run left at its commit prompt never sent the commit; dropping the step
    // made the flow look as if it had moved on to payment.
    const result = resumeAtCommitPrompt(false)

    expect(result.current.transactions.map(({ id }) => id)).toEqual([
      REGISTRATION_TX_IDS.commit,
      REGISTRATION_TX_IDS.approve,
      REGISTRATION_TX_IDS.register,
    ])
  })

  it('drops an approve that landed, whatever the page last read', () => {
    // The page's allowance read (mocked here as never loaded) can predate the
    // approve. After a disconnect and return it listed the step again, and
    // hid the register countdown behind it.
    const result = resumeAtCommitPrompt(true, false)

    expect(result.current.transactions.map(({ id }) => id)).toEqual([
      REGISTRATION_TX_IDS.register,
    ])
  })

  it('lists only the steps after a commitment that landed', () => {
    const result = resumeAtCommitPrompt(true)

    expect(result.current.transactions.map(({ id }) => id)).toEqual([
      REGISTRATION_TX_IDS.approve,
      REGISTRATION_TX_IDS.register,
    ])
  })
})

describe('useRegistrationTransactions retry after a failed step', () => {
  const TX_HASH = `0x${'ef'.repeat(32)}` as Hash

  const request: TransactionRequest = {
    type: 'eoa',
    from: OWNER,
    to: '0x2222222222222222222222222222222222222222',
    data: '0x',
    value: 0n,
    chainId: sepolia.id,
  }

  // A wallet whose first eth_sendTransaction fails transiently when `flaky`.
  const signerWith = ({ flaky }: { flaky: boolean }): EOASigner => {
    let sends = 0
    return {
      type: 'eoa',
      walletClient: createWalletClient({
        account: OWNER,
        chain: sepolia,
        transport: custom(
          {
            request: async ({ method }) => {
              if (method === 'eth_chainId') return toHex(sepolia.id)
              if (method === 'eth_sendTransaction') {
                sends += 1
                if (flaky && sends === 1) throw new Error('socket hang up')
                return TX_HASH
              }
              throw new Error(`unexpected RPC call: ${method}`)
            },
          },
          { retryCount: 0 },
        ),
      }),
    }
  }

  const clientWith = (status: TransactionReceipt['status']) =>
    ({
      waitForTransactionReceipt: async () => ({
        status,
        transactionHash: TX_HASH,
        blockNumber: 1n,
      }),
    }) as unknown as PublicClient

  afterEach(() => {
    vi.restoreAllMocks()
    transactionManager.clear()
  })

  it('keeps a step that landed after an automatic resubmission', async () => {
    // The commit needed a second wallet send but landed; the approve reverted.
    transactionManager.startTransaction(request, signerWith({ flaky: true }), {
      id: REGISTRATION_TX_IDS.commit,
      publicClient: clientWith('success'),
      retryDelay: 0,
    })
    transactionManager.startTransaction(request, signerWith({ flaky: false }), {
      id: REGISTRATION_TX_IDS.approve,
      publicClient: clientWith('reverted'),
    })
    const commitTx = transactionManager.getTransaction(
      REGISTRATION_TX_IDS.commit,
    )
    const approveTx = transactionManager.getTransaction(
      REGISTRATION_TX_IDS.approve,
    )
    if (!commitTx || !approveTx) throw new Error('transactions not started')
    await waitFor(commitTx, (s) => s.matches('success'))
    await waitFor(approveTx, (s) => s.matches('error'))
    expect(commitTx.getSnapshot().context.retryCount).toBe(1)

    const { result } = renderHook(() =>
      useRegistrationTransactions({ name: 'leon.eth', duration: 31_536_000 }),
    )
    // Put the registration run in its failed state, as the reverted approve
    // would, and keep the retry itself from driving the machine.
    const { actor } = result.current
    vi.spyOn(actor, 'getSnapshot').mockReturnValue({
      ...actor.getSnapshot(),
      value: 'error',
    } as ReturnType<typeof actor.getSnapshot>)
    const send = vi.spyOn(actor, 'send').mockImplementation(() => {})

    const commitStep = result.current.transactions.find(
      ({ id }) => id === REGISTRATION_TX_IDS.commit,
    )
    await act(async () => {
      await (commitStep?.onStart() as unknown as Promise<void>)
    })

    expect(send).toHaveBeenCalledWith({ type: 'RETRY' })
    // Only the failed approve is retired; the landed commit stays done.
    expect(transactionManager.getTransaction(REGISTRATION_TX_IDS.approve)).toBe(
      undefined,
    )
    expect(transactionManager.getTransaction(REGISTRATION_TX_IDS.commit)).toBe(
      commitTx,
    )
    vi.restoreAllMocks()
  })
})

describe('useRegistrationTransactions before a run', () => {
  const render = () =>
    renderHook(() =>
      useRegistrationTransactions({ name: 'leon.eth', duration: 31_536_000 }),
    ).result

  afterEach(() => {
    vi.mocked(useBytecode).mockReset()
  })

  it("lists the deploy step for the wallet's first registration", () => {
    const result = render()

    expect(result.current.transactions.map(({ id }) => id)).toEqual([
      REGISTRATION_TX_IDS.deployResolver,
      REGISTRATION_TX_IDS.commit,
      REGISTRATION_TX_IDS.approve,
      REGISTRATION_TX_IDS.register,
    ])
  })

  it('drops the deploy step once the wallet has a resolver', () => {
    vi.mocked(useBytecode).mockReturnValue({
      data: '0x6080',
      isSuccess: true,
    } as never)
    const result = render()

    expect(result.current.transactions.map(({ id }) => id)).toEqual([
      REGISTRATION_TX_IDS.commit,
      REGISTRATION_TX_IDS.approve,
      REGISTRATION_TX_IDS.register,
    ])
  })

  it('leaves the deploy step out while the resolver read has no answer', () => {
    // Pending or failed: the wallet may have a resolver already, and an
    // estimate against it would fail.
    vi.mocked(useBytecode).mockReturnValue({
      data: undefined,
      isSuccess: false,
    } as never)
    const result = render()

    expect(result.current.transactions.map(({ id }) => id)).toEqual([
      REGISTRATION_TX_IDS.commit,
      REGISTRATION_TX_IDS.approve,
      REGISTRATION_TX_IDS.register,
    ])
  })
})
