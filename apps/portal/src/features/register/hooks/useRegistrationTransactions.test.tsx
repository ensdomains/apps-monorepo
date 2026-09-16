import {
  buildRegistrationRecord,
  REGISTRATION_TX_IDS,
  type Signer,
} from '@ens-apps/transaction-manager'
import { act, renderHook } from '@testing-library/react'
import type { Address, Hash, Hex } from 'viem'
import { describe, expect, it, vi } from 'vitest'
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

const resumeAtCommitPrompt = (commitmentOnChain: boolean) => {
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

  it('lists only the steps after a commitment that landed', () => {
    const result = resumeAtCommitPrompt(true)

    expect(result.current.transactions.map(({ id }) => id)).toEqual([
      REGISTRATION_TX_IDS.approve,
      REGISTRATION_TX_IDS.register,
    ])
  })
})
