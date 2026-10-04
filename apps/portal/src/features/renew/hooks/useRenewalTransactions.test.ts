// @vitest-environment happy-dom
import {
  type CustomTransactionIntent,
  getPrimaryCall,
  transactionManager,
} from '@ens-apps/transaction-manager'
import { act, renderHook } from '@testing-library/react'
import {
  type Address,
  decodeFunctionData,
  erc20Abi,
  type PublicClient,
} from 'viem'
import { assert, beforeEach, describe, expect, it, vi } from 'vitest'
import { SUPPORTED_TOKENS } from '@/lib/constants/tokens'
import { sepoliaWithEns } from '@/lib/wagmi'
import { buildRenewIntent } from '../utils/buildRenewIntent'
import { getRenewerAddress } from '../utils/renewer'
import { useRenewalTransactions } from './useRenewalTransactions'

const from: Address = '0x03Ba34f6Ea1496fa316873CF8350A3f7eaD317EF'
const walletClient = { account: { address: from } }

vi.mock('@ens-apps/transaction-manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ens-apps/transaction-manager')>()),
  transactionManager: { clear: vi.fn(), startTransaction: vi.fn() },
}))

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConfig: () => ({}),
  useConnection: () => ({ address: from }),
  usePublicClient: () => ({}),
}))

vi.mock('@wagmi/core/actions', () => ({
  getWalletClient: async () => walletClient,
}))

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

vi.mock('@/features/registry/utils/signer.helpers', () => ({
  createEOASigner: () => ({ type: 'eoa' }),
}))

// Every approval goes out as an EOA custom intent carrying the encoded call.
const decodeApprove = (intent: unknown) => {
  const data = getPrimaryCall((intent as CustomTransactionIntent).request)?.data
  assert(data)
  return decodeFunctionData({ abi: erc20Abi, data }).args
}

const tokenPrice = 5_000_000n

// `renew()` takes no amount and pulls its own oracle price, so the approval is
// the only cap on the charge: it must be the quoted price, never padded.
describe('useRenewalTransactions approval amount', () => {
  beforeEach(() => {
    vi.mocked(transactionManager.startTransaction).mockClear()
  })

  it('approves exactly the quoted price for a single renewal', async () => {
    const { result } = renderHook(() => useRenewalTransactions())
    act(() =>
      result.current.startFlow(
        { name: 'example.eth', isV2: true },
        {
          duration: 31_536_000,
          tokenAddress: SUPPORTED_TOKENS.USDC,
          tokenPrice,
        },
      ),
    )

    const [approveTx] = result.current.transactions
    const estimated = await approveTx?.intent?.prepare?.({
      walletClient,
    } as never)
    expect(decodeApprove(estimated)).toEqual([
      getRenewerAddress(true),
      tokenPrice,
    ])

    await act(() => approveTx?.onStart?.())
    const submitted = vi.mocked(transactionManager.startTransaction).mock
      .calls[0]?.[0]
    expect(decodeApprove(submitted)).toEqual([
      getRenewerAddress(true),
      tokenPrice,
    ])
  })

  it('approves exactly each renewer total for a batch', async () => {
    const payments = [
      { renewer: getRenewerAddress(true), total: tokenPrice, allowance: 0n },
      { renewer: getRenewerAddress(false), total: 3_000_000n, allowance: 0n },
    ]
    const { result } = renderHook(() => useRenewalTransactions())
    act(() =>
      result.current.startMultiFlow({
        renewals: [
          { selectedName: { name: 'a.eth', isV2: true }, duration: 31_536_000 },
          {
            selectedName: { name: 'b.eth', isV2: false },
            duration: 31_536_000,
          },
        ],
        tokenAddress: SUPPORTED_TOKENS.USDC,
        payments,
      }),
    )

    const approveTxs = result.current.transactions.slice(0, payments.length)
    for (const [i, approveTx] of approveTxs.entries()) {
      await act(() => approveTx.onStart?.())
      const submitted = vi.mocked(transactionManager.startTransaction).mock
        .calls[i]?.[0]
      expect(decodeApprove(submitted)).toEqual([
        payments[i]?.renewer,
        payments[i]?.total,
      ])
    }
  })
})

const FROM = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const USDC = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address

// `renewNameWriteParameters` is a pure encode — it only reads chain contract
// addresses off the client.
const publicClient = { chain: sepoliaWithEns } as unknown as PublicClient

const renewParams = (name: string) => ({
  name,
  duration: 31_536_000,
  tokenAddress: USDC,
  from: FROM,
  publicClient,
  isV2: true,
})

describe('buildRenewIntent', () => {
  // The label the renewer is called with comes from `getLabel`, which
  // normalises: without this refusal, renewing `ALICE.eth` would push
  // `alice.eth`'s expiry — a different name that someone else may own. The UI
  // gate lives in `isExtendable2LD`; this is the same gate at signing time, and
  // it covers the modal's gas estimate as well as the submit.
  it.each([
    ['an uppercase label', 'ALICE.eth'],
    ['a fullwidth homoglyph label', 'ａlice.eth'],
    ['an uppercase TLD', 'alice.ETH'],
  ])('refuses %s', (_case, name) => {
    expect(() => buildRenewIntent(renewParams(name))).toThrow(/normalized form/)
  })

  it('builds the intent for the canonical spelling', () => {
    const intent = buildRenewIntent(renewParams('alice.eth'))
    expect(intent).toBeDefined()
  })
})
