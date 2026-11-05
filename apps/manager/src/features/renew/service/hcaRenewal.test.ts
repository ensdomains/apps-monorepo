// biome-ignore-all lint/suspicious/noExplicitAny: test fixtures use loose typing

import type {
  PendingEthSwap,
  RhinestoneTransactionRequest,
  TransactionOptions,
} from '@ens-apps/transaction-manager'
import { transactionMachine } from '@ens-apps/transaction-manager/machines/transaction.machine'
import { createRhinestoneAccount } from '@rhinestone/sdk'
import { err, errAsync, ok, okAsync } from 'neverthrow'
import type { Address, Hex, PublicClient, WalletClient } from 'viem'
import { decodeFunctionData, erc20Abi } from 'viem'
import { toAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createActor, waitFor } from 'xstate'

// The root package API is stubbed to capture funding inputs and submission options.
// The accepted-intent regression feeds those options into the actual machine and Warp transport.
const mocks = vi.hoisted(() => ({
  getRenewPrice: vi.fn(),
  assertPaymentTokenSupported: vi.fn(),
  encodeRenewData: vi.fn(() => '0xrenew' as Hex),
  encodeRenewBatchData: vi.fn(() => '0xrenewbatch' as Hex),
  planHcaIntentFunding: vi.fn(),
  startTransaction: vi.fn(),
  waitForTransaction: vi.fn(),
  getSmartAccountAddress: vi.fn(),
  quoteHcaIntentFeeUsdc: vi.fn(),
  awaitL2BridgeActor: vi.fn(),
  readHcaUsdcBalanceActor: vi.fn(),
  readHcaUsdcBalanceAtLeastActor: vi.fn(),
  submitL2BridgeActor: vi.fn(),
  swapEthForUsdcActor: vi.fn(),
}))

vi.mock('@ens-apps/transaction-manager', () => ({
  getSmartAccountAddress: mocks.getSmartAccountAddress,
  // A stand-in ceiling that scales with the limit; the real curve is covered in
  // the transaction-manager suite.
  hcaMaxIntentFeeUsdcFor: (gasLimit: bigint) =>
    (gasLimit * 10_000_000n) / 300_000n,
  planHcaIntentFunding: mocks.planHcaIntentFunding,
  quoteHcaIntentFeeUsdc: mocks.quoteHcaIntentFeeUsdc,
  swapEthForUsdcActor: mocks.swapEthForUsdcActor,
  transactionManager: { startTransaction: mocks.startTransaction },
  waitForTransaction: mocks.waitForTransaction,
}))

vi.mock(
  '@ens-apps/transaction-manager/machines/registration/registration.hca.actors',
  () => ({
    awaitL2BridgeActor: mocks.awaitL2BridgeActor,
    L2_BRIDGE_CLAIMABLE_MS: 3_600_000,
    readHcaUsdcBalanceActor: mocks.readHcaUsdcBalanceActor,
    readHcaUsdcBalanceAtLeastActor: mocks.readHcaUsdcBalanceAtLeastActor,
    submitL2BridgeActor: mocks.submitL2BridgeActor,
  }),
)

vi.mock('@/lib/smart-account/rhinestone', () => ({
  buildIntentStatusFetcher: () => undefined,
}))

vi.mock(
  '@ens-apps/transaction-manager/machines/registration/registration.actors',
  () => ({
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

import {
  readPendingEthSwap,
  savePendingEthSwap,
} from '@/features/register-v2/service/pendingEthSwap'
import {
  readPendingL2Bridge,
  savePendingL2Bridge,
} from '@/features/register-v2/service/pendingL2Bridge'
import { TOKENS } from '@/lib/tokens'
import {
  fundHcaRenewalsFromL2,
  fundHcaRenewalsWithEth,
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
  it('approves the renewer for exactly the live price, then renews', async () => {
    await submitHcaRenewal(params)

    // Priced at submit time, not from the screen before: the renewer computes
    // the price when it executes.
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
      args: [RENEWER, 1_000_000n],
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

  it('funds the price on top of the fee, since both come out of the HCA', async () => {
    await submitHcaRenewal(params)

    expect(fundingParams()).toMatchObject({
      tokenSpend: {
        token: USDC,
        symbol: 'USDC',
        decimals: 6,
        amount: 1_000_000n,
      },
      gasLimit: HCA_RENEWAL_INTENT_GAS_LIMIT_BASE,
      maxFeeUsdc: 20_000_000n,
      ownerAddress: OWNER,
    })
  })

  it('checks the funding against the debit the payment screen showed', async () => {
    const displayedDebit = { usdc: 1_000_000n, token: 0n }

    await submitHcaRenewal({ ...params, displayedDebit })

    expect(fundingParams()).toMatchObject({ displayedDebit })
  })

  it('asks about the re-quoted payment only when the wallet would pay more than was confirmed', async () => {
    const displayedDebit = { usdc: 6_690_000n, token: 0n }
    const confirmIncreasedPayment = vi.fn().mockResolvedValue(false)
    const prompt = (permitValue: bigint) => ({
      permitValue,
      requiresPermit: true,
      quotedFeeUsdc: 900_000n,
      hcaBalanceUsdc: 3_000_000n,
      requiredUsdc: 8_800_000n,
    })

    await submitHcaRenewal({
      ...params,
      displayedDebit,
      confirmIncreasedPayment,
    })
    const { confirmFunding, ...funding } = fundingParams()

    // The planner signs for the prompt's amount, so it is not given the
    // drift-tolerant displayed debit to check against.
    expect(funding).not.toHaveProperty('displayedDebit')
    expect(await confirmFunding(prompt(6_690_000n))).toBe(true)
    expect(await confirmFunding(prompt(6_000_000n))).toBe(true)
    expect(confirmIncreasedPayment).not.toHaveBeenCalled()

    expect(await confirmFunding(prompt(6_700_000n))).toBe(false)
    expect(confirmIncreasedPayment).toHaveBeenCalledExactlyOnceWith(
      prompt(6_700_000n),
    )
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
      tokenSpend: { amount: 3_000_000n },
      gasLimit:
        HCA_RENEWAL_INTENT_GAS_LIMIT_BASE +
        2n * HCA_RENEWAL_INTENT_GAS_LIMIT_PER_ITEM,
    })
  })

  it('pays the price in DAI as a leg of its own, the fee still in USDC', async () => {
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
        amount: 1_000_000n,
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
    readContract.mockResolvedValue(1_000_000n)

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

  it('opts renewals out of automatic intent resubmission', async () => {
    await submitHcaRenewal(params)
    expect(mocks.startTransaction.mock.calls[0]?.[2]).toHaveProperty(
      'retryCount',
      0,
    )
  })

  it('submits once through the actual machine and Warp transport when the accepted intent loses its fill response', async () => {
    const onSubmitted = vi.fn()
    readContract.mockResolvedValue(1_000_000n)
    await submitHcaRenewal({ ...params, onSubmitted })
    const started = mocks.startTransaction.mock.calls[0]
    if (!started) throw new Error('Renewal did not start a transaction')
    const request: RhinestoneTransactionRequest = started[0].request
    const options: TransactionOptions = started[2]
    const account = await createRhinestoneAccount({
      owners: { type: 'ecdsa', accounts: [toAccount(OWNER)] },
    })
    vi.spyOn(account, 'getAddress').mockReturnValue(HCA)
    const prepare = vi
      .spyOn(account, 'prepareTransaction')
      .mockImplementation(vi.fn().mockResolvedValue({ intentRoute: {} }))
    const sign = vi
      .spyOn(account, 'signTransaction')
      .mockImplementation(vi.fn().mockResolvedValue({}))
    const submit = vi
      .spyOn(account, 'submitTransaction')
      .mockImplementation(vi.fn().mockResolvedValue({ id: 1n }))
    const fill = vi
      .spyOn(account, 'waitForExecution')
      .mockRejectedValue(new Error('fill status connection lost'))
    const actor = createActor(transactionMachine, {
      input: {
        publicClient,
        request,
        signer: {
          type: 'rhinestone',
          account,
          config: {
            chain: sepolia,
          },
        },
        options: { ...options, retryDelay: 1 },
      },
    }).start()
    try {
      await waitFor(actor, (snapshot) =>
        snapshot.matches({ error: 'submission' }),
      )
      expect(onSubmitted).toHaveBeenCalledOnce()
      expect(prepare).toHaveBeenCalledOnce()
      expect(sign).toHaveBeenCalledOnce()
      expect(submit).toHaveBeenCalledOnce()
      expect(fill).toHaveBeenCalledOnce()
    } finally {
      actor.stop()
    }
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

  it('reports the tx id as soon as the record exists, and submission when the transport says so', async () => {
    const onTxId = vi.fn()
    const onSubmitted = vi.fn()
    mocks.waitForTransaction.mockImplementation(async () => {
      // The transport fires this after the signature, before the fill.
      expect(onSubmitted).not.toHaveBeenCalled()
      const [{ request }] = mocks.startTransaction.mock.calls[0] as [
        { request: { rhinestoneParams: { onIntentSubmitted?: () => void } } },
      ]
      request.rhinestoneParams.onIntentSubmitted?.()
    })

    await submitHcaRenewal({ ...params, onTxId, onSubmitted })

    expect(onTxId).toHaveBeenCalledWith('tx-1')
    expect(onSubmitted).toHaveBeenCalledWith('tx-1')
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

describe('submitHcaRenewal paid from an L2', () => {
  const source = { chain: { id: 84_532, name: 'Base Sepolia' } } as any
  const run = (l2Funding: Record<string, unknown> = {}) =>
    submitHcaRenewal({
      ...params,
      l2Funding: { source, displayedCharge: 2_100_000n, ...l2Funding },
    })
  const bridged = () => mocks.submitL2BridgeActor.mock.calls[0]?.[0]

  beforeEach(() => {
    window.localStorage.clear()
    mocks.quoteHcaIntentFeeUsdc.mockResolvedValue(900_000n)
    mocks.readHcaUsdcBalanceActor.mockReturnValue(okAsync(200_000n))
    mocks.readHcaUsdcBalanceAtLeastActor.mockImplementation(({ atLeast }) =>
      okAsync(atLeast),
    )
    mocks.submitL2BridgeActor.mockReturnValue(okAsync('bridge-tx'))
  })

  it('bridges what the account is short in, then renews from the account', async () => {
    mocks.planHcaIntentFunding.mockImplementation(async ({ calls }: any) => {
      // The renewal is planned only once the bridged USDC reads back.
      expect(mocks.readHcaUsdcBalanceAtLeastActor).toHaveBeenCalled()
      return { calls, quotedFeeUsdc: 900_000n }
    })

    await run()

    // 1.00 price + 0.90 fee widened by 25%, less the 0.20 already held.
    expect(bridged()).toMatchObject({
      hca: HCA,
      payment: { source, amount: 1_925_000n, displayedCharge: 2_100_000n },
      signer: { session: undefined },
    })
    expect(mocks.waitForTransaction).toHaveBeenCalledWith('bridge-tx')
    expect(mocks.readHcaUsdcBalanceAtLeastActor).toHaveBeenCalledWith(
      expect.objectContaining({ atLeast: 2_125_000n }),
    )
    expect(mocks.planHcaIntentFunding).toHaveBeenCalledOnce()
  })

  it('never asks about the wallet after the bridge, and refuses anything left for it to pay', async () => {
    const confirmIncreasedPayment = vi.fn()
    await submitHcaRenewal({
      ...params,
      confirmIncreasedPayment,
      l2Funding: { source, displayedCharge: 2_100_000n },
    })

    expect(fundingParams()).toMatchObject({
      displayedDebit: { usdc: 0n, token: 0n },
    })
    expect(fundingParams()).not.toHaveProperty('confirmFunding')
    expect(confirmIncreasedPayment).not.toHaveBeenCalled()
  })

  it('plans the renewal on the balance the bridge read back, past a lagging node', async () => {
    await run()

    expect(fundingParams()).toMatchObject({ hcaBalanceAtLeast: 2_125_000n })
  })

  it('sends nothing from the L2 when the account already covers the renewal', async () => {
    mocks.readHcaUsdcBalanceActor.mockReturnValue(okAsync(5_000_000n))

    await run()

    expect(mocks.submitL2BridgeActor).not.toHaveBeenCalled()
    expect(mocks.planHcaIntentFunding).toHaveBeenCalledOnce()
  })

  it('keeps an accepted payment that never filled, and waits for it on the retry', async () => {
    mocks.submitL2BridgeActor.mockImplementationOnce(
      ({ onIntentSubmitted }: any) => {
        onIntentSubmitted(7n)
        return okAsync('bridge-tx')
      },
    )
    mocks.waitForTransaction.mockRejectedValueOnce(new Error('fill timed out'))

    await expect(run()).rejects.toThrow('fill timed out')
    expect(readPendingL2Bridge(params.chainId, HCA)).toMatchObject({
      intentId: 7n,
      fundsHcaTo: 2_125_000n,
    })
    expect(mocks.planHcaIntentFunding).not.toHaveBeenCalled()

    // It landed after all: the retry reads it back and pays nothing more.
    mocks.awaitL2BridgeActor.mockReturnValue(okAsync('landed'))
    mocks.readHcaUsdcBalanceActor.mockReturnValue(okAsync(2_125_000n))

    await run()

    expect(mocks.awaitL2BridgeActor).toHaveBeenCalledWith(
      expect.objectContaining({ intentId: 7n }),
    )
    expect(mocks.submitL2BridgeActor).toHaveBeenCalledOnce()
    expect(readPendingL2Bridge(params.chainId, HCA)).toBeUndefined()
  })

  it('keeps the payment pending and stops when the bridged USDC never reads back', async () => {
    mocks.submitL2BridgeActor.mockImplementationOnce(
      ({ onIntentSubmitted }: any) => {
        onIntentSubmitted(8n)
        return okAsync('bridge-tx')
      },
    )
    // The read runs out of time still showing the balance from before.
    mocks.readHcaUsdcBalanceAtLeastActor.mockReturnValue(okAsync(200_000n))

    await expect(run()).rejects.toThrow(/hasn't shown up/)
    expect(readPendingL2Bridge(params.chainId, HCA)).toMatchObject({
      intentId: 8n,
    })
    expect(mocks.planHcaIntentFunding).not.toHaveBeenCalled()
  })

  it('bridges a bulk selection once, sized over every batch', async () => {
    await fundHcaRenewalsFromL2({
      ...params,
      batches: [
        [{ label: 'alice', duration: 31_536_000n }],
        [{ label: 'bob', duration: 31_536_000n }],
      ],
      l2Funding: { source, displayedCharge: 4_300_000n },
    })

    // 2 × 1.00 price + 2 × 0.90 fee widened by 25%, less the 0.20 held.
    expect(mocks.submitL2BridgeActor).toHaveBeenCalledOnce()
    expect(bridged()).toMatchObject({
      payment: { amount: 4_050_000n, displayedCharge: 4_300_000n },
    })
  })

  it('settles an earlier payment whose USDC was spent since, as registration does', async () => {
    savePendingL2Bridge(params.chainId, HCA, {
      intentId: 10n,
      claimableUntil: Date.now() + 60_000,
      fundsHcaTo: 3_000_000n,
    })
    mocks.awaitL2BridgeActor.mockReturnValue(okAsync('landed'))
    // It landed, but an L1 retry spent it, so the balance never gets back there.
    mocks.readHcaUsdcBalanceAtLeastActor.mockReturnValueOnce(okAsync(200_000n))

    await run()

    expect(readPendingL2Bridge(params.chainId, HCA)).toBeUndefined()
    // Sized on what the account holds now, not on the spent payment.
    expect(bridged()).toMatchObject({ payment: { amount: 1_925_000n } })
    expect(mocks.planHcaIntentFunding).toHaveBeenCalledOnce()
  })

  it('pays nothing while an earlier payment is still unsettled', async () => {
    savePendingL2Bridge(params.chainId, HCA, {
      intentId: 9n,
      claimableUntil: Date.now() + 60_000,
      fundsHcaTo: 3_000_000n,
    })
    mocks.awaitL2BridgeActor.mockReturnValue(
      errAsync(new Error('The earlier L2 payment has not settled yet')),
    )

    await expect(run()).rejects.toThrow(/not settled yet/)
    expect(mocks.submitL2BridgeActor).not.toHaveBeenCalled()
    expect(readPendingL2Bridge(params.chainId, HCA)).toBeDefined()
  })

  it('refuses a fee above the ceiling before the wallet is asked', async () => {
    mocks.quoteHcaIntentFeeUsdc.mockResolvedValue(50_000_000n)

    await expect(run()).rejects.toThrow()
    expect(mocks.submitL2BridgeActor).not.toHaveBeenCalled()
  })

  it('pays a renewal in USDC only', async () => {
    await expect(
      submitHcaRenewal({ ...params, token: 'DAI', l2Funding: { source } }),
    ).rejects.toThrow(/USDC only/)
    expect(mocks.submitL2BridgeActor).not.toHaveBeenCalled()
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

it('does not start an intent after funding completes for a detached renewal screen', async () => {
  const cancelled = new AbortController()
  mocks.planHcaIntentFunding.mockImplementationOnce(
    async ({ calls }: { readonly calls: readonly unknown[] }) => {
      cancelled.abort()
      return { calls, quotedFeeUsdc: 900_000n }
    },
  )
  await expect(
    submitHcaRenewal({ ...params, signal: cancelled.signal }),
  ).rejects.toThrow('screen was closed')
  expect(mocks.startTransaction).not.toHaveBeenCalled()
})

it('does not start an intent when its screen detaches during the final live identity RPC', async () => {
  let release: (
    addresses: Awaited<ReturnType<WalletClient['getAddresses']>>,
  ) => void = () => undefined
  const addresses = new Promise<
    Awaited<ReturnType<WalletClient['getAddresses']>>
  >((resolve) => {
    release = resolve
  })
  const cancelled = new AbortController()
  const getAddresses = vi.fn(() => addresses)
  const running = submitHcaRenewal({
    ...params,
    publicClient: { ...publicClient, chain: sepolia },
    walletClient: {
      ...walletClient,
      getAddresses,
      getChainId: async () => params.chainId,
    },
    signal: cancelled.signal,
    approvalFallback: { confirmApproval: () => true },
  })
  await vi.waitFor(() => expect(getAddresses).toHaveBeenCalledOnce())
  cancelled.abort()
  release([OWNER])
  await expect(running).rejects.toThrow()
  expect(mocks.startTransaction).not.toHaveBeenCalled()
})

it('checks cancellation at the synchronous intent handoff after identity validation returns', async () => {
  const cancelled = new AbortController()
  const addresses: Awaited<ReturnType<WalletClient['getAddresses']>> = [OWNER]
  // Schedule the external cancellation after the helper reads its identity, before the caller resumes.
  Object.defineProperty(addresses, 0, {
    get: () => {
      queueMicrotask(() => cancelled.abort())
      return OWNER
    },
  })
  await expect(
    submitHcaRenewal({
      ...params,
      publicClient: { ...publicClient, chain: sepolia },
      walletClient: {
        ...walletClient,
        getAddresses: async () => addresses,
        getChainId: async () => params.chainId,
      },
      signal: cancelled.signal,
      approvalFallback: { confirmApproval: () => true },
    }),
  ).rejects.toThrow()
  expect(mocks.startTransaction).not.toHaveBeenCalled()
})

type SwapStubInput = { readonly onSwapSent?: (swap: PendingEthSwap) => void }

describe('submitHcaRenewal paid with ETH', () => {
  const ethFunding = { usdcAmount: 2_025_000n, displayedCharge: 10n ** 15n }
  const sent = { hash: `0x${'ab'.repeat(32)}` as Hex, deadline: 1_700_000_000n }
  const swapInput = () => mocks.swapEthForUsdcActor.mock.calls[0]?.[0]

  beforeEach(() => {
    window.localStorage.clear()
    mocks.swapEthForUsdcActor.mockImplementation(
      ({ onSwapSent }: SwapStubInput) => {
        onSwapSent?.(sent)
        return okAsync(2_025_000n)
      },
    )
    mocks.readHcaUsdcBalanceAtLeastActor.mockReturnValue(okAsync(2_025_000n))
  })

  it('plans the permit only once a read shows the wallet holding the USDC it bought', async () => {
    mocks.planHcaIntentFunding.mockImplementation(
      async ({ calls }: { readonly calls: unknown }) => {
        expect(mocks.readHcaUsdcBalanceAtLeastActor).toHaveBeenCalledWith(
          expect.objectContaining({ hca: OWNER, atLeast: 2_025_000n }),
        )
        return { calls, quotedFeeUsdc: 900_000n }
      },
    )

    await submitHcaRenewal({ ...params, ethFunding })

    expect(mocks.planHcaIntentFunding).toHaveBeenCalledOnce()
  })

  it('swaps for the USDC first, then funds the account with the usual permit', async () => {
    mocks.planHcaIntentFunding.mockImplementation(
      async ({ calls }: { readonly calls: unknown }) => {
        expect(mocks.swapEthForUsdcActor).toHaveBeenCalledOnce()
        return { calls, quotedFeeUsdc: 900_000n }
      },
    )
    const displayedDebit = { usdc: 2_000_000n, token: 0n }

    await submitHcaRenewal({ ...params, displayedDebit, ethFunding })

    expect(swapInput()).toMatchObject({
      permitValue: 2_025_000n,
      funding: { displayedCharge: 10n ** 15n },
      approvalSigner: { type: 'eoa', walletClient },
    })
    // The wallet still pays by permit, so the debit shown is still checked.
    expect(fundingParams()).toMatchObject({ displayedDebit })
    expect(readPendingEthSwap(params.chainId, OWNER)).toBeUndefined()
  })

  it('counts a swap an earlier attempt sent instead of buying again', async () => {
    savePendingEthSwap(params.chainId, OWNER, sent)

    await submitHcaRenewal({ ...params, ethFunding })

    expect(swapInput()).toMatchObject({ pendingSwap: sent })
  })

  it('stops before any permit when the swap fails, keeping the sent swap for the retry', async () => {
    mocks.swapEthForUsdcActor.mockImplementation(
      ({ onSwapSent }: SwapStubInput) => {
        onSwapSent?.(sent)
        return errAsync(new Error('The ETH swap failed on-chain.'))
      },
    )

    await expect(submitHcaRenewal({ ...params, ethFunding })).rejects.toThrow(
      'The ETH swap failed on-chain.',
    )
    expect(mocks.planHcaIntentFunding).not.toHaveBeenCalled()
    expect(readPendingEthSwap(params.chainId, OWNER)).toEqual(sent)
  })
})

describe('fundHcaRenewalsWithEth', () => {
  const batches = [
    [{ label: 'alice', duration: 31_536_000n }],
    [{ label: 'bob', duration: 31_536_000n }],
  ]
  const run = (overrides: Record<string, unknown> = {}) =>
    fundHcaRenewalsWithEth({
      ...params,
      batches,
      ethFunding: { displayedCharge: 10n ** 16n },
      ...overrides,
    })

  beforeEach(() => {
    window.localStorage.clear()
    mocks.quoteHcaIntentFeeUsdc.mockResolvedValue(900_000n)
    mocks.readHcaUsdcBalanceActor.mockReturnValue(okAsync(200_000n))
    mocks.swapEthForUsdcActor.mockReturnValue(okAsync(4_250_000n))
  })

  it('swaps once for what the batches it is given are short, bounded by the ETH shown', async () => {
    await run()

    // 2 × 1.00 price + 2 × 0.90 fee widened by 25%, less the 0.20 held.
    expect(mocks.swapEthForUsdcActor).toHaveBeenCalledOnce()
    expect(mocks.swapEthForUsdcActor.mock.calls[0]?.[0]).toMatchObject({
      permitValue: 4_050_000n,
      funding: { displayedCharge: 10n ** 16n },
    })
  })

  it('sizes a retry on the names left, not the whole selection', async () => {
    await run({ batches: [batches[0]] })

    // 1.00 price + 0.90 fee widened by 25%, less the 0.20 held.
    expect(mocks.swapEthForUsdcActor.mock.calls[0]?.[0]).toMatchObject({
      permitValue: 1_925_000n,
    })
  })

  it('swaps nothing with a wallet that does not control the owner', async () => {
    await expect(
      run({ walletClient: { account: { address: RENEWER } } }),
    ).rejects.toThrow(/does not control the owner/)
    expect(mocks.swapEthForUsdcActor).not.toHaveBeenCalled()
  })

  it('swaps nothing when the account already covers the batches', async () => {
    mocks.readHcaUsdcBalanceActor.mockReturnValue(okAsync(10_000_000n))

    await run()

    expect(mocks.swapEthForUsdcActor).not.toHaveBeenCalled()
  })
})
