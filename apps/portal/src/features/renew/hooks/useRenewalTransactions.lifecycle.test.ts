// @vitest-environment happy-dom
import {
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import {
  createCountingWallet,
  resetTransactionManager,
  testPublicClient,
} from '@ens-apps/transaction-manager/test-utils/transactionActor'
import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SUPPORTED_TOKENS } from '@/lib/constants/tokens'
import { ensChain } from '@/lib/wagmi'
import { useRenewalTransactions } from './useRenewalTransactions'

const capture = vi.hoisted(() => vi.fn())
const wallet = createCountingWallet(
  '0x1111111111111111111111111111111111111111',
)
const publicClient = { ...testPublicClient, chain: ensChain }

vi.mock('@ens-apps/transaction-manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ens-apps/transaction-manager')>()),
  useAtomicBatchSupport: () => false,
  useHasDeclinedAtomicUpgrade: () => false,
}))
vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConfig: () => ({}),
  useConnection: () => ({ address: wallet.address }),
  usePublicClient: () => publicClient,
}))
vi.mock('@wagmi/core/actions', () => ({
  getWalletClient: async () => wallet.signer.walletClient,
  getConnection: () => ({ connector: undefined }),
}))
vi.mock('@tanstack/react-router', () => ({ useSearch: () => ({}) }))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/features/transaction-manager/hooks/useTransactionModal', () => ({
  useTransactionModal: () => ({
    openModal: vi.fn(),
    closeModal: vi.fn(),
    clearTransaction: vi.fn(),
  }),
}))
vi.mock('@/lib/posthog/events', () => ({
  startAnalyticsOperation: () => ({ capture }),
}))

afterEach(() => {
  resetTransactionManager()
  capture.mockClear()
})

it('records the renewal receipt after its initiating UI unmounts, before Done', async () => {
  const onComplete = vi.fn()
  const hold = wallet.hold()
  const { result, unmount } = renderHook(() =>
    useRenewalTransactions({ onComplete }),
  )
  act(() =>
    result.current.startFlow(
      { name: 'example.eth', isV2: true },
      {
        duration: 31_536_000,
        tokenAddress: SUPPORTED_TOKENS.USDC,
        tokenPrice: 5_000_000n,
        tokenAllowance: 5_000_000n,
      },
    ),
  )
  const transaction = result.current.transactions[0]
  await act(() => transaction?.onStart())
  const id = transaction?.id ?? ''
  expect(transactionManager.getTransaction(id)?.getSnapshot().value).toBe(
    'submitting',
  )
  unmount()
  hold.release()
  await waitForTransaction(id)
  expect(
    capture.mock.calls.filter(([name]) => name === 'renewal:flow_complete'),
  ).toHaveLength(1)
  expect(
    capture.mock.calls.filter(
      ([name]) => name === 'renewal:transaction_confirm',
    ),
  ).toEqual([
    [
      'renewal:transaction_confirm',
      expect.objectContaining({ stage: 'execution' }),
    ],
  ])
  expect(onComplete).not.toHaveBeenCalled()
})
