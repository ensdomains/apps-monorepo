// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { ok } from 'neverthrow'
import { type Address, getAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Transaction } from '@/features/transaction-manager/types'
import type { TransferSubject } from '../types'
import type {
  TransferOptions,
  TransferStepKind,
} from '../utils/buildTransferPlan'
import { useTransferName } from './useTransferName'

// Checksummed, as the hook stores the record it read.
const ACCOUNT = getAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
const RECIPIENT = getAddress('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
const REGISTRY = '0x1111111111111111111111111111111111111111' as Address
const RESOLVER = '0x2222222222222222222222222222222222222222' as Address

// What the chain holds, per read: the record before any flow, then whatever
// the test says a flow left behind.
const chain = vi.hoisted(() => ({ ethRecord: null as string | null }))
const modal = vi.hoisted(() => ({ isOpen: false }))
// Which steps the wallet lets through. A step not listed is rejected before it
// is sent (no hash), like a declined prompt.
const wallet = vi.hoisted(() => ({ confirms: new Set<string>() }))

vi.mock('@ens-apps/transaction-manager', () => ({
  transactionManager: {
    startTransaction: vi.fn(
      (_intent: unknown, _signer: unknown, { id }: { id: string }) => id,
    ),
    clear: vi.fn(),
    getTransaction: vi.fn(),
  },
  waitForTransaction: vi.fn(async (id: string) => {
    const step = id.replace(/^transfer-alice\.eth-/, '')
    if (!wallet.confirms.has(step)) throw new Error('User rejected the request')
  }),
  scopeTransactionId: (id: string) => id,
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))

vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi')>()
  return { ...actual, useConfig: () => ({}), usePublicClient: () => ({}) }
})

vi.mock('@wagmi/core/actions', () => ({
  getWalletClient: vi.fn(async () => ({ account: { address: ACCOUNT } })),
}))

vi.mock('@/features/registry/utils/signer.helpers', () => ({
  createEOASigner: () => ({}),
}))

vi.mock('@/features/transaction-manager/hooks/useTransactionModal', () => ({
  useTransactionModal: () => ({
    isOpen: modal.isOpen,
    openModal: vi.fn(),
    closeModal: vi.fn(),
    clearTransaction: vi.fn(),
  }),
}))

vi.mock('@/features/transaction-manager/hooks/useFlowAttempt', () => ({
  useFlowAttempt: () => ({ scope: null, start: vi.fn(), end: vi.fn() }),
}))

vi.mock(
  '@/features/transaction-manager/hooks/useTransactionGasEstimate',
  () => ({
    estimateGasForCall: vi.fn(async () => 21_000n),
    isRevertError: () => false,
  }),
)

// Records what each step's calldata would be built from; the builder itself
// has its own tests.
const buildIntent = vi.hoisted(() =>
  vi.fn((_step: TransferStepKind, _ctx: Record<string, unknown>) => ({
    request: { type: 'eoa' },
  })),
)
vi.mock('../utils/buildTransferStepIntent', () => ({
  buildTransferStepIntent: buildIntent,
}))

vi.mock('../queries/getOwnResolver', () => ({
  getOwnResolverQueryOptions: () => ({
    queryKey: ['transfer-own-resolver'],
    queryFn: async () => RESOLVER,
  }),
}))

vi.mock('../queries/getEthAddress', () => ({
  getEthAddressQueryOptions: () => ({
    queryKey: ['transfer-eth-address'],
    queryFn: async () => chain.ethRecord,
  }),
}))

vi.mock('@/features/resolver/hooks/useIsPermissionedResolver', () => ({
  getIsPermissionedResolverQueryOptions: () => ({
    queryKey: ['is-permissioned-resolver'],
    queryFn: async () => true,
  }),
}))

vi.mock('@/features/profile/hooks/useTokenId', () => ({
  getEnsTokenId: () => ok(1n),
}))

const subject: TransferSubject = { kind: 'v2', registryAddress: REGISTRY }

// Resolver kept, so the plan is `set-eth-addr` then `transfer-token`.
const options: TransferOptions = {
  setEthAddress: true,
  detachResolver: false,
  detachRegistry: false,
}

const renderTransfer = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return renderHook(
    () => useTransferName({ name: 'alice.eth', account: ACCOUNT, subject }),
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    },
  )
}

type Hook = ReturnType<typeof renderTransfer>

/** Prepares the flow, then runs every step the way the modal would. */
const runFlow = async ({ result, rerender }: Hook) => {
  modal.isOpen = true
  act(() => {
    result.current.startTransfer({
      recipient: RECIPIENT,
      recipientInput: RECIPIENT,
      options,
    })
  })
  await waitFor(() => expect(result.current.transactions.length).toBe(2))
  const [record, move] = result.current.transactions as [
    Transaction,
    Transaction,
  ]
  await act(async () => {
    await record.onStart?.()
  })
  await act(async () => {
    await move.onStart?.()
  })
  modal.isOpen = false
  rerender()
}

describe('useTransferName — ETH address record ahead of the move (WEB-1508)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    chain.ethRecord = ACCOUNT
    modal.isOpen = false
    wallet.confirms = new Set()
  })

  it('reports the record stranded once the modal closes, with the pre-flow address to restore', async () => {
    wallet.confirms = new Set(['set-eth-addr'])
    const hook = renderTransfer()
    await runFlow(hook)

    expect(hook.result.current.recordAheadOfMove).toEqual({
      recipient: RECIPIENT,
      previousEthAddress: ACCOUNT,
    })
  })

  it('stays quiet while the modal is still open', async () => {
    wallet.confirms = new Set(['set-eth-addr'])
    const hook = renderTransfer()
    await runFlow(hook)
    modal.isOpen = true
    hook.rerender()

    expect(hook.result.current.recordAheadOfMove).toBeNull()
  })

  it('stays quiet when the move confirmed', async () => {
    wallet.confirms = new Set(['set-eth-addr', 'transfer-token'])
    const hook = renderTransfer()
    await runFlow(hook)

    expect(hook.result.current.recordAheadOfMove).toBeNull()
  })

  it('stays quiet when the record write was rejected too', async () => {
    const hook = renderTransfer()
    await runFlow(hook)

    expect(hook.result.current.recordAheadOfMove).toBeNull()
  })

  it('restores with a single step built from the pre-flow address', async () => {
    wallet.confirms = new Set(['set-eth-addr', 'restore-eth-addr'])
    const hook = renderTransfer()
    await runFlow(hook)

    act(() => hook.result.current.restoreEthAddress())
    const steps = hook.result.current.transactions
    expect(steps.map(({ title }) => title)).toEqual(['Restore ETH address'])

    buildIntent.mockClear()
    await act(async () => {
      await steps[0]?.onStart?.()
    })
    expect(buildIntent).toHaveBeenCalledWith(
      'restore-eth-addr',
      expect.objectContaining({ previousEthAddress: ACCOUNT }),
    )
  })

  it('keeps the first attempt’s address as the restore target across a retry', async () => {
    wallet.confirms = new Set(['set-eth-addr'])
    const hook = renderTransfer()
    await runFlow(hook)

    // The first attempt left the record on the recipient, so the retry's
    // fresh read sees the recipient, not the address to put back.
    chain.ethRecord = RECIPIENT
    await runFlow(hook)

    expect(hook.result.current.recordAheadOfMove).toEqual({
      recipient: RECIPIENT,
      previousEthAddress: ACCOUNT,
    })
  })

  it('offers nothing to restore to when the record was unset before the flow', async () => {
    chain.ethRecord = null
    wallet.confirms = new Set(['set-eth-addr'])
    const hook = renderTransfer()
    await runFlow(hook)

    expect(hook.result.current.recordAheadOfMove).toEqual({
      recipient: RECIPIENT,
      previousEthAddress: null,
    })
    act(() => hook.result.current.restoreEthAddress())
    // Still the stranded flow, not a restore that would write nothing.
    expect(hook.result.current.transactions).toHaveLength(2)
  })
})
