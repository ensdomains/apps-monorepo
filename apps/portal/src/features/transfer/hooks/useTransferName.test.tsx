import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { ok } from 'neverthrow'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TransferSubject } from '../types'
import type { TransferOptions } from '../utils/buildTransferPlan'
import { NonCanonicalNameError, useTransferName } from './useTransferName'

const ACCOUNT = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const RECIPIENT = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address
const REGISTRY = '0x1111111111111111111111111111111111111111' as Address
const RESOLVER = '0x2222222222222222222222222222222222222222' as Address

const openModal = vi.fn()

vi.mock('@ens-apps/transaction-manager', () => ({
  transactionManager: {
    startTransaction: vi.fn(),
    clear: vi.fn(),
    getTransaction: vi.fn(),
  },
  waitForTransaction: vi.fn(),
  createFlowScope: (address: Address) => ({
    account: address.toLowerCase(),
    nonce: 'scope1',
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

vi.mock('@/features/transaction-manager/hooks/useTransactionModal', () => ({
  useTransactionModal: () => ({
    openModal,
    closeModal: vi.fn(),
    clearTransaction: vi.fn(),
  }),
}))

// `useFlowAttempt` opens the modal when the attempt is named, so a real scope
// is needed for the canonical case to reach `openModal` at all. The scope
// itself is asserted elsewhere (scopedStepFlows.test.ts).
vi.mock('@/features/transaction-manager/hooks/useFlowAttempt', () => ({
  useFlowAttempt: () => ({ scope: null, start: openModal, end: vi.fn() }),
}))

// The preflight estimate and the intent builder have their own tests; hold both
// open so the only thing that can refuse below is the canonical gate.
vi.mock(
  '@/features/transaction-manager/hooks/useTransactionGasEstimate',
  () => ({
    estimateGasForCall: vi.fn(async () => 21_000n),
    isRevertError: () => false,
  }),
)

vi.mock('../utils/buildTransferStepIntent', () => ({
  buildTransferStepIntent: () => ({ request: { type: 'eoa' } }),
}))

// The V2 read: both lookups succeed, so a name that reaches them prepares.
const getOwnResolver = vi.fn(async () => RESOLVER)
vi.mock('../queries/getOwnResolver', () => ({
  getOwnResolverQueryOptions: () => ({
    queryKey: ['transfer-own-resolver'],
    queryFn: () => getOwnResolver(),
  }),
}))

const getEnsTokenId = vi.fn(() => ok(1n))
vi.mock('@/features/profile/hooks/useTokenId', () => ({
  getEnsTokenId: () => getEnsTokenId(),
}))

const subject: TransferSubject = { kind: 'v2', registryAddress: REGISTRY }

// Move-only: the pre-move options are off, so the plan is the single step the
// canonical gate has to stop.
const options: TransferOptions = {
  setEthAddress: false,
  detachResolver: false,
  detachRegistry: false,
}

const renderTransfer = (name: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return renderHook(
    () => useTransferName({ name, account: ACCOUNT, subject }),
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    },
  )
}

// The route refuses non-canonical names before the form is offered, but the
// route gate can only speak for its own page. This is the same gate inside the
// hook, so no other entry point (or a later route change) can hand the flow a
// name whose label hashes to a different token: every step derives the label
// with `getLabel`, which normalises, so `ALICE.eth` would move `alice.eth`.
describe('useTransferName — non-canonical name gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    ['an uppercase label', 'ALICE.eth'],
    ['a fullwidth homoglyph label', 'ａlice.eth'],
    ['a non-canonical subname label', 'SUB.alice.eth'],
    ['an encoded labelhash label', `[${'a'.repeat(64)}].eth`],
  ])('refuses %s without reading or preparing anything', async (_case, name) => {
    const { result } = renderTransfer(name)

    act(() => {
      result.current.startTransfer({
        recipient: RECIPIENT,
        recipientInput: RECIPIENT,
        options,
      })
    })

    await waitFor(() => {
      expect(result.current.prepError).toBeInstanceOf(NonCanonicalNameError)
    })
    expect(result.current.prepError?.message).toMatch(/normalized form/)
    // Nothing was read, estimated or opened: the refusal is the first thing.
    expect(getOwnResolver).not.toHaveBeenCalled()
    expect(getEnsTokenId).not.toHaveBeenCalled()
    expect(openModal).not.toHaveBeenCalled()
    expect(result.current.transactions).toEqual([])
  })

  it('prepares the canonical spelling', async () => {
    const { result } = renderTransfer('alice.eth')

    act(() => {
      result.current.startTransfer({
        recipient: RECIPIENT,
        recipientInput: RECIPIENT,
        options,
      })
    })

    await waitFor(() => {
      expect(openModal).toHaveBeenCalled()
    })
    expect(result.current.prepError).toBeNull()
  })
})
