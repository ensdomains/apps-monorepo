// @vitest-environment happy-dom
import {
  type CustomTransactionIntent,
  getPrimaryCall,
  transactionManager,
} from '@ens-apps/transaction-manager'
import { ethRegistrarRenewSnippet } from '@ensdomains/ensjs-abi/v2/ethRegistrar'
import { act, renderHook } from '@testing-library/react'
import {
  type Address,
  decodeFunctionData,
  erc20Abi,
  type PublicClient,
  parseAbi,
} from 'viem'
import { afterEach, assert, beforeEach, describe, expect, it, vi } from 'vitest'
import { SUPPORTED_TOKENS } from '@/lib/constants/tokens'
import { ensChain } from '@/lib/wagmi'
import {
  buildRenewBatchIntent,
  buildRenewIntent,
} from '../utils/buildRenewIntent'
import { getRenewerAddress } from '../utils/renewer'
import { useRenewalTransactions } from './useRenewalTransactions'

const from: Address = '0x03Ba34f6Ea1496fa316873CF8350A3f7eaD317EF'
const walletClient = { account: { address: from } }
const wallet = vi.hoisted(() => ({ canBatchAtomically: false }))

vi.mock('@ens-apps/transaction-manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ens-apps/transaction-manager')>()),
  transactionManager: { clear: vi.fn(), startTransaction: vi.fn() },
  useAtomicBatchSupport: () => wallet.canBatchAtomically,
}))

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConfig: () => ({}),
  useConnection: () => ({ address: from }),
  usePublicClient: () => publicClient,
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

describe('useRenewalTransactions batch renew', () => {
  beforeEach(() => {
    vi.mocked(transactionManager.startTransaction).mockClear()
  })

  it('renews every name on a renewer in one renewBatch, at its own duration', async () => {
    const { result } = renderHook(() => useRenewalTransactions())
    act(() =>
      result.current.startMultiFlow({
        renewals: [
          { selectedName: { name: 'a.eth', isV2: true }, duration: 100 },
          { selectedName: { name: 'b.eth', isV2: false }, duration: 200 },
          { selectedName: { name: 'c.eth', isV2: true }, duration: 300 },
        ],
        tokenAddress: SUPPORTED_TOKENS.USDC,
        payments: [
          { renewer: getRenewerAddress(true), total: 1n, allowance: 1n },
          { renewer: getRenewerAddress(false), total: 1n, allowance: 1n },
        ],
      }),
    )

    const { transactions } = result.current
    expect(transactions.map((tx) => tx.title)).toEqual([
      'Extend 2 v2 names',
      'Extend b.eth',
    ])
    for (const tx of transactions) await act(() => tx.onStart?.())

    const renewBatchAbi = parseAbi([
      'function renewBatch((string label, uint64 duration, bytes32 referrer)[] rds, address paymentToken)',
    ])
    const submitted = vi
      .mocked(transactionManager.startTransaction)
      .mock.calls.map(([intent]) => {
        const call = getPrimaryCall((intent as CustomTransactionIntent).request)
        assert(call?.data)
        return {
          to: call.to,
          args: decodeFunctionData({ abi: renewBatchAbi, data: call.data })
            .args,
        }
      })
    expect(submitted).toEqual([
      {
        to: getRenewerAddress(true),
        args: [
          [
            { label: 'a', duration: 100n, referrer: `0x${'0'.repeat(60)}1234` },
            { label: 'c', duration: 300n, referrer: `0x${'0'.repeat(60)}1234` },
          ],
          SUPPORTED_TOKENS.USDC,
        ],
      },
      {
        to: getRenewerAddress(false),
        args: [
          [{ label: 'b', duration: 200n, referrer: `0x${'0'.repeat(60)}1234` }],
          SUPPORTED_TOKENS.USDC,
        ],
      },
    ])
  })
})

// A wallet with EIP-5792 atomic support confirms the whole flow at once.
describe('useRenewalTransactions with an atomic-batching wallet', () => {
  beforeEach(() => {
    wallet.canBatchAtomically = true
    vi.mocked(transactionManager.startTransaction).mockClear()
  })
  afterEach(() => {
    wallet.canBatchAtomically = false
  })

  const submittedBundle = () => {
    const intent = vi.mocked(transactionManager.startTransaction).mock
      .calls[0]?.[0] as CustomTransactionIntent | undefined
    assert(intent?.request.type === 'eoa-batch')
    return intent.request
  }

  it('approves and renews one name in a single confirmation', async () => {
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

    expect(result.current.transactions).toHaveLength(1)
    await act(() => result.current.transactions[0]?.onStart?.())

    const bundle = submittedBundle()
    expect(bundle.calls).toHaveLength(2)
    const [approveCall, renewCall] = bundle.calls
    assert(approveCall)
    expect(
      decodeFunctionData({ abi: erc20Abi, data: approveCall.data }).args,
    ).toEqual([getRenewerAddress(true), tokenPrice])
    expect(renewCall?.to).toBe(getRenewerAddress(true))
    assert(renewCall)
    expect(
      decodeFunctionData({
        abi: ethRegistrarRenewSnippet,
        data: renewCall.data,
      }).args?.[0].referrer,
    ).toBe(`0x${'0'.repeat(60)}1234`)
  })

  it('confirms every approval and renew of a batch at once, in order', async () => {
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
        payments: [
          {
            renewer: getRenewerAddress(true),
            total: tokenPrice,
            allowance: 0n,
          },
          {
            renewer: getRenewerAddress(false),
            total: 3_000_000n,
            allowance: 0n,
          },
        ],
      }),
    )

    expect(result.current.transactions).toHaveLength(1)
    await act(() => result.current.transactions[0]?.onStart?.())

    expect(submittedBundle().calls.map(({ to }) => to)).toEqual([
      SUPPORTED_TOKENS.USDC,
      SUPPORTED_TOKENS.USDC,
      getRenewerAddress(true),
      getRenewerAddress(false),
    ])
    for (const call of submittedBundle().calls.slice(2)) {
      const decoded = decodeFunctionData({
        abi: parseAbi([
          'function renewBatch((string label, uint64 duration, bytes32 referrer)[] rds, address paymentToken)',
        ]),
        data: call.data,
      })
      expect(decoded.args[0].map((entry) => entry.referrer)).toEqual([
        `0x${'0'.repeat(60)}1234`,
      ])
    }
  })
})

const FROM = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const USDC = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address

// `renewNameWriteParameters` is a pure encode — it only reads chain contract
// addresses off the client.
const publicClient = { chain: ensChain } as unknown as PublicClient

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

  it('refuses a batch holding a non-canonical name', () => {
    expect(() =>
      buildRenewBatchIntent({
        renewals: [
          { selectedName: { name: 'bob.eth', isV2: true }, duration: 1 },
          { selectedName: { name: 'ALICE.eth', isV2: true }, duration: 1 },
        ],
        renewer: getRenewerAddress(true),
        tokenAddress: USDC,
        from: FROM,
      }),
    ).toThrow(/normalized form/)
  })

  it('builds the intent for the canonical spelling', () => {
    const intent = buildRenewIntent(renewParams('alice.eth'))
    expect(intent).toBeDefined()
  })
})

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useSearch: () => ({ referrer: '0x1234' }),
}))

describe('renewal referrer propagation', () => {
  it.each(['single', 'multi'] as const)(
    'carries URL attribution into every %s renewal',
    async (kind) => {
      vi.mocked(transactionManager.startTransaction).mockClear()
      const { result } = renderHook(() => useRenewalTransactions())
      act(() => {
        if (kind === 'single') {
          result.current.startFlow(
            { name: 'alice.eth', isV2: true },
            {
              duration: 31_536_000,
              tokenAddress: SUPPORTED_TOKENS.USDC,
              tokenPrice,
              tokenAllowance: tokenPrice,
            },
          )
        } else {
          result.current.startMultiFlow({
            renewals: [
              {
                selectedName: { name: 'alice.eth', isV2: true },
                duration: 31_536_000,
              },
              {
                selectedName: { name: 'bob.eth', isV2: false },
                duration: 31_536_000,
              },
            ],
            tokenAddress: SUPPORTED_TOKENS.USDC,
            payments: [
              {
                renewer: getRenewerAddress(true),
                total: tokenPrice,
                allowance: tokenPrice,
              },
              {
                renewer: getRenewerAddress(false),
                total: tokenPrice,
                allowance: tokenPrice,
              },
            ],
          })
        }
      })
      for (const transaction of result.current.transactions) {
        await act(() => transaction.onStart?.())
      }
      const calls = vi.mocked(transactionManager.startTransaction).mock.calls
      expect(calls).toHaveLength(kind === 'single' ? 1 : 2)
      for (const [intent] of calls) {
        assert(intent.type === 'custom')
        const call = getPrimaryCall(intent.request)
        assert(call?.data)
        if (kind === 'single') {
          const decoded = decodeFunctionData({
            abi: ethRegistrarRenewSnippet,
            data: call.data,
          })
          expect(decoded.args?.[0].referrer).toBe(`0x${'0'.repeat(60)}1234`)
        } else {
          const decoded = decodeFunctionData({
            abi: parseAbi([
              'function renewBatch((string label, uint64 duration, bytes32 referrer)[] rds, address paymentToken)',
            ]),
            data: call.data,
          })
          expect(decoded.args[0].map((entry) => entry.referrer)).toEqual([
            `0x${'0'.repeat(60)}1234`,
          ])
        }
      }
    },
  )
})
