// biome-ignore-all lint/suspicious/noExplicitAny: test fixtures use loose typing
import { err, ok } from 'neverthrow'
import type { Address, Hex, PublicClient, WalletClient } from 'viem'
import { decodeFunctionData, erc20Abi } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The whole package is stubbed: this suite covers what the service DOES with
// the funding rail, the live price read and the transaction manager, each of
// which has its own coverage where it lives.
const mocks = vi.hoisted(() => ({
  getRenewPrice: vi.fn(),
  assertPaymentTokenSupported: vi.fn(),
  encodeRenewData: vi.fn(() => '0xrenew' as Hex),
  encodeRenewBatchData: vi.fn(() => '0xrenewbatch' as Hex),
  planHcaIntentFunding: vi.fn(),
  startTransaction: vi.fn(),
  waitForTransaction: vi.fn(),
  getSmartAccountAddress: vi.fn(),
}))

vi.mock('@ens-apps/transaction-manager', () => ({
  getSmartAccountAddress: mocks.getSmartAccountAddress,
  // A stand-in ceiling that scales with the limit; the real curve is covered in
  // the transaction-manager suite.
  hcaMaxIntentFeeUsdcFor: (gasLimit: bigint) =>
    (gasLimit * 10_000_000n) / 300_000n,
  planHcaIntentFunding: mocks.planHcaIntentFunding,
  transactionManager: { startTransaction: mocks.startTransaction },
  waitForTransaction: mocks.waitForTransaction,
}))

vi.mock(
  '@ens-apps/transaction-manager/machines/registration/registration.actors',
  () => ({
    // Mirrors the real helper: the renewer pulls up to 10% above the quote.
    authorizedPaymentAmount: (price: bigint) => price + price / 10n,
    encodeRenewData: mocks.encodeRenewData,
    encodeRenewBatchData: mocks.encodeRenewBatchData,
  }),
)

vi.mock('@ens-apps/transaction-manager/contracts/paymentToken', () => ({
  assertPaymentTokenSupported: mocks.assertPaymentTokenSupported,
}))

vi.mock('../data/queries/renewPricing.query', () => ({
  getRenewPrice: mocks.getRenewPrice,
}))

import { TOKENS } from '@/lib/tokens'
import {
  HCA_RENEWAL_INTENT_GAS_LIMIT_BASE,
  HCA_RENEWAL_INTENT_GAS_LIMIT_PER_ITEM,
  HCA_RENEWAL_INTENT_TOKEN_FUNDING_GAS,
  submitHcaRenewal,
} from './hcaRenewal'

const USDC = TOKENS.USDC.address
const RENEWER = '0x9999999999999999999999999999999999999999' as Address
const OWNER = '0x3333333333333333333333333333333333333333' as Address
const HCA = '0xaaaa000000000000000000000000000000000001' as Address

const readContract = vi.fn()
const publicClient = { readContract } as unknown as PublicClient
const walletClient = {
  account: { address: OWNER },
} as unknown as WalletClient

/** The signer the account context holds: an HCA with a scoped session on it. */
const signer = {
  type: 'rhinestone',
  session: { permissions: { calls: [] } },
} as any

const params = {
  items: [{ label: 'alice', duration: 31_536_000n }],
  renewerAddress: RENEWER,
  protocol: 'v2' as const,
  token: 'USDC' as const,
  signer,
  ownerAddress: OWNER,
  walletClient,
  publicClient,
  chainId: 11_155_111,
}

/** The action calls the service handed to the funding rail. */
const actionCalls = () => mocks.planHcaIntentFunding.mock.calls[0]?.[0]?.calls
const approveCall = () => actionCalls()?.[0]
const actionCall = () => actionCalls()?.at(-1)
const fundingParams = () => mocks.planHcaIntentFunding.mock.calls[0]?.[0]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getRenewPrice.mockResolvedValue(ok({ amount: 1_000_000n }))
  readContract.mockReset()
  readContract.mockResolvedValue(0n)
  mocks.getSmartAccountAddress.mockReturnValue(HCA)
  mocks.startTransaction.mockReturnValue('tx-1')
  mocks.waitForTransaction.mockResolvedValue(undefined)
  mocks.planHcaIntentFunding.mockImplementation(async ({ calls }: any) => ({
    calls,
    quotedFeeUsdc: 900_000n,
  }))
})

describe('submitHcaRenewal', () => {
  it('approves the renewer for the live rent plus headroom, then renews', async () => {
    await submitHcaRenewal(params)

    // Priced at submit time, not from the screen before: the renewer computes
    // the rent when it executes.
    expect(mocks.getRenewPrice).toHaveBeenCalledWith(
      'alice',
      31_536_000n,
      'USDC',
      'v2',
    )

    const approve = approveCall()
    expect(
      decodeFunctionData({ abi: erc20Abi, data: approve.data as Hex }),
    ).toMatchObject({
      functionName: 'approve',
      // 1.0 rent + 10% drift headroom — bounded, deliberately not unlimited.
      args: [RENEWER, 1_100_000n],
    })
    expect(actionCall()).toMatchObject({
      to: RENEWER,
      data: '0xrenew',
      value: 0n,
    })
    expect(mocks.encodeRenewData).toHaveBeenCalledWith(
      'alice',
      31_536_000n,
      USDC,
      undefined,
    )
    expect(mocks.encodeRenewBatchData).not.toHaveBeenCalled()
  })

  it('funds the rent on top of the fee, since both come out of the HCA', async () => {
    await submitHcaRenewal(params)

    expect(fundingParams()).toMatchObject({
      tokenSpend: {
        token: USDC,
        symbol: 'USDC',
        decimals: 6,
        amount: 1_100_000n,
      },
      gasLimit: HCA_RENEWAL_INTENT_GAS_LIMIT_BASE,
      maxFeeUsdc: 20_000_000n,
      ownerAddress: OWNER,
    })
  })

  it('batches several names into one call, with a limit scaled to the count', async () => {
    const items = [
      { label: 'alice', duration: 31_536_000n },
      { label: 'bob', duration: 31_536_000n },
      { label: 'carol', duration: 31_536_000n },
    ]

    await submitHcaRenewal({ ...params, items })

    expect(mocks.getRenewPrice).toHaveBeenCalledTimes(3)
    expect(mocks.encodeRenewBatchData).toHaveBeenCalledWith(items, USDC)
    // One batch call for all three, plus the single approval.
    expect(actionCalls()).toHaveLength(2)
    expect(fundingParams()).toMatchObject({
      tokenSpend: { amount: 3_300_000n },
      gasLimit:
        HCA_RENEWAL_INTENT_GAS_LIMIT_BASE +
        2n * HCA_RENEWAL_INTENT_GAS_LIMIT_PER_ITEM,
    })
  })

  it('pays the rent in DAI as a leg of its own, the fee still in USDC', async () => {
    const DAI = TOKENS.DAI.address

    await submitHcaRenewal({ ...params, token: 'DAI' })

    expect(mocks.getRenewPrice).toHaveBeenCalledWith(
      'alice',
      31_536_000n,
      'DAI',
      'v2',
    )
    expect(mocks.assertPaymentTokenSupported).toHaveBeenCalledWith(
      publicClient,
      RENEWER,
      DAI,
    )
    // The HCA approves and renews in DAI…
    expect(approveCall()).toMatchObject({ to: DAI })
    expect(mocks.encodeRenewData).toHaveBeenCalledWith(
      'alice',
      31_536_000n,
      DAI,
      undefined,
    )
    // …and the rail funds it beside the fee, with room for the second pair.
    expect(fundingParams()).toMatchObject({
      tokenSpend: {
        token: DAI,
        symbol: 'DAI',
        decimals: 18,
        amount: 1_100_000n,
      },
      gasLimit:
        HCA_RENEWAL_INTENT_GAS_LIMIT_BASE +
        HCA_RENEWAL_INTENT_TOKEN_FUNDING_GAS,
    })
    expect(mocks.startTransaction.mock.calls[0]?.[0]).toMatchObject({
      request: { rhinestoneParams: { feeAsset: 'USDC' } },
    })
  })

  it('skips the approval when the account already allows the renewer', async () => {
    // Cheap on-chain read: a standing allowance turns the approval call into
    // dead weight in a batch that is priced per call.
    readContract.mockResolvedValue(1_100_000n)

    await submitHcaRenewal(params)

    expect(actionCalls()).toHaveLength(1)
    expect(actionCall()).toMatchObject({ to: RENEWER })
  })

  it('signs the intent as the OWNER, without the scoped session', async () => {
    // `HCAOwnerAndSessionValidator` allowlists only `commit`/`register` for
    // sessions, so a session-signed renew reverts `ActionNotAllowed`.
    await submitHcaRenewal(params)

    expect(fundingParams().signer.session).toBeUndefined()
    expect(mocks.startTransaction.mock.calls[0]?.[1]).toMatchObject({
      type: 'rhinestone',
      session: undefined,
    })
  })

  it('submits an intent from the account, paid in USDC', async () => {
    await submitHcaRenewal(params)

    expect(mocks.startTransaction.mock.calls[0]?.[0]).toMatchObject({
      type: 'custom',
      request: {
        type: 'rhinestone-intent',
        from: HCA,
        chainId: params.chainId,
        rhinestoneParams: {
          feeAsset: 'USDC',
          calls: actionCalls(),
        },
      },
    })
  })

  it('spreads the declared inflow so the planner can price an empty account', async () => {
    mocks.planHcaIntentFunding.mockResolvedValue({
      calls: [{ to: USDC, value: 0n, data: '0xfunded' as Hex }],
      quotedFeeUsdc: 900_000n,
      incomingUsdc: 2_000_000n,
      auxiliaryFunds: { [params.chainId]: { [USDC]: 2_000_000n } },
    })

    await submitHcaRenewal(params)

    expect(
      mocks.startTransaction.mock.calls[0]?.[0]?.request?.rhinestoneParams,
    ).toMatchObject({
      auxiliaryFunds: { [params.chainId]: { [USDC]: 2_000_000n } },
    })
  })

  it('resolves only once the intent has filled', async () => {
    let filled: () => void = () => {}
    mocks.waitForTransaction.mockReturnValue(
      new Promise<void>((resolve) => {
        filled = resolve
      }),
    )

    let resolved = false
    const renewal = submitHcaRenewal(params).then((result) => {
      resolved = true
      return result
    })

    // Polls rather than draining a fixed number of microtasks: the price reads
    // resolve through a Result chain, so the number of hops to the fill call
    // is an implementation detail, not a contract.
    await vi.waitFor(() =>
      expect(mocks.waitForTransaction).toHaveBeenCalledWith('tx-1'),
    )
    expect(resolved).toBe(false)

    filled()
    await expect(renewal).resolves.toMatchObject({
      txId: 'tx-1',
      quotedFeeUsdc: 900_000n,
    })
  })

  it('reports the tx id as soon as it is submitted', async () => {
    const onTxId = vi.fn()

    await submitHcaRenewal({ ...params, onTxId })

    expect(onTxId).toHaveBeenCalledWith('tx-1')
  })

  it('refuses to sign with a wallet that does not control the owner', async () => {
    await expect(
      submitHcaRenewal({
        ...params,
        walletClient: {
          account: { address: RENEWER },
        } as unknown as WalletClient,
      }),
    ).rejects.toThrow(/does not control the owner/)
    expect(mocks.getRenewPrice).not.toHaveBeenCalled()
  })

  it('needs at least one name', async () => {
    await expect(submitHcaRenewal({ ...params, items: [] })).rejects.toThrow(
      /at least one name/,
    )
  })

  it('surfaces a failed price read instead of sizing a guess', async () => {
    mocks.getRenewPrice.mockResolvedValue(err(new Error('price feed down')))

    await expect(submitHcaRenewal(params)).rejects.toThrow('price feed down')
    expect(mocks.planHcaIntentFunding).not.toHaveBeenCalled()
  })

  it('checks the renewer accepts this token before spending on it', async () => {
    await submitHcaRenewal(params)

    expect(mocks.assertPaymentTokenSupported).toHaveBeenCalledWith(
      publicClient,
      RENEWER,
      USDC,
    )
  })
})

it('carries the supplied referrer into the owner-signed HCA renewal', async () => {
  await submitHcaRenewal({
    ...params,
    items: [{ label: 'alice', duration: 31_536_000n, referrer: '0x1234' }],
  })
  expect(mocks.encodeRenewData).toHaveBeenCalledWith(
    'alice',
    31_536_000n,
    USDC,
    '0x1234',
  )
})
