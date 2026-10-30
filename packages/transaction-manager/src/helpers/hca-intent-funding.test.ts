import { getDestinationContracts } from '@ens-apps/smart-account'
import type { Address, Hex, PublicClient } from 'viem'
import {
  createWalletClient,
  custom,
  decodeFunctionData,
  getAddress,
  parseAbi,
} from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RhinestoneSigner, Signer } from '../types/signer.types'
import type { Call } from '../types/transaction.types'
import {
  HCA_MAX_STANDALONE_INTENT_FEE_USDC,
  HCA_STANDALONE_INTENT_GAS_LIMIT,
  HcaFundingDeclinedError,
  type HcaFundingPrompt,
  hcaMaxIntentFeeUsdcFor,
  type PermitKind,
  planHcaIntentFunding,
} from './hca-intent-funding'

const readContract = vi.fn()
vi.mock('viem/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem/actions')>()),
  readContract: (...args: unknown[]) => readContract(...args),
}))

const signFundingPermit = vi.fn()
vi.mock('../machines/registration/registration.hca.actors', async (orig) => ({
  ...(await orig<
    typeof import('../machines/registration/registration.hca.actors')
  >()),
  signFundingPermitForTokenActor: (...args: unknown[]) =>
    signFundingPermit(...args),
}))

const C = getDestinationContracts(sepolia.id)

const HCA = '0xaaaa000000000000000000000000000000000001' as Address
const OWNER = '0x3333333333333333333333333333333333333333' as Address
const ACTION_TARGET = '0x00000000000000000000000000000000000000d1' as Address

const erc2612Abi = parseAbi([
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
])

/** The decoded function name of a call, without a non-null assertion. */
const fnNameOf = (call: Call | undefined) =>
  decodeFunctionData({ abi: erc2612Abi, data: call?.data as Hex }).functionName

const actionCalls: Call[] = [
  { to: ACTION_TARGET, value: 0n, data: '0xdeadbeef' as Hex },
]

const prepareTransaction = vi.fn()

const signer = {
  type: 'rhinestone',
  account: {
    getAddress: () => HCA,
    prepareTransaction: (...args: unknown[]) => prepareTransaction(...args),
  },
} as unknown as RhinestoneSigner

const publicClient = { chain: sepolia } as unknown as PublicClient
const approvalSigner = { type: 'eoa' } as unknown as Signer

/** A quote the orchestrator priced at `fee` USDC (6dp). */
const quoteOf = (fee: bigint) => ({
  intentRoute: {
    intentCost: {
      tokensSpent: {
        [String(sepolia.id)]: {
          [C.usdc.toLowerCase()]: { locked: '0', unlocked: String(fee) },
        },
      },
    },
  },
})

const params = {
  signer,
  ownerAddress: OWNER,
  approvalSigner,
  publicClient,
  chainId: sepolia.id,
  calls: actionCalls,
}

type Reads = {
  readonly hcaBalance?: bigint
  readonly walletBalance?: bigint
  /** The wallet's standing allowance to the HCA. */
  readonly allowance?: bigint
}

/**
 * Token reads answered per call, since balances and allowances come off the
 * same contracts. The wallet holds plenty unless a test says otherwise, and
 * `tokens` overrides the reads for one token.
 */
const mockReads = (
  reads: Reads & { readonly tokens?: Record<Address, Reads> } = {},
) => {
  readContract.mockImplementation(
    (
      _client: unknown,
      {
        address,
        functionName,
        args,
      }: { address: Address; functionName: string; args: unknown[] },
    ) => {
      const read = {
        hcaBalance: 0n,
        walletBalance: 1_000_000_000_000_000_000_000n,
        allowance: 0n,
        ...reads,
        ...reads.tokens?.[address],
      }
      if (functionName === 'allowance') return Promise.resolve(read.allowance)
      return Promise.resolve(
        args[0] === HCA ? read.hcaBalance : read.walletBalance,
      )
    },
  )
}

const signature = {
  v: 27,
  r: `0x${'11'.repeat(32)}` as Hex,
  s: `0x${'22'.repeat(32)}` as Hex,
}

/** What the mocked permit actor resolves to, in the token's permit shape. */
const signedPermit = (kind: PermitKind = 'eip2612') => ({
  match: (ok: (v: unknown) => unknown) =>
    ok(
      kind === 'dai-legacy'
        ? {
            kind,
            holder: OWNER,
            spender: HCA,
            nonce: 4n,
            expiry: 1_800_000_000n,
            allowed: true,
            ...signature,
          }
        : {
            kind,
            owner: OWNER,
            spender: HCA,
            value: 900_000n,
            deadline: 1_800_000_000n,
            ...signature,
          },
    ),
})

beforeEach(() => {
  vi.clearAllMocks()
  readContract.mockReset()
  mockReads()
  prepareTransaction.mockResolvedValue(quoteOf(900_000n))
  signFundingPermit.mockImplementation(
    (input: { token?: { permitKind?: PermitKind } }) =>
      signedPermit(input.token?.permitKind),
  )
})

describe('planHcaIntentFunding', () => {
  // At ~1 Mwei the quoted spend leaves out most of the relay fee the refund
  // overhead carries; the permit has to cover what will actually be pulled.
  it('funds the relay fee carried in the refund overhead, not just the spend', async () => {
    mockReads({ hcaBalance: 0n })
    prepareTransaction.mockResolvedValue({
      intentRoute: {
        ...quoteOf(3_000n).intentRoute,
        intentOp: {
          signedMetadata: { gasPrices: { [String(sepolia.id)]: '1100031' } },
          elements: [
            {
              mandate: {
                qualifier: {
                  settlementContext: {
                    gasRefund: {
                      token: C.usdc,
                      exchangeRate: '2560716071',
                      overhead: ((21_717n << 128n) | 2_597_034n).toString(),
                    },
                  },
                },
              },
            },
          ],
        },
      },
    })

    const funding = await planHcaIntentFunding(params)

    // (300k + 2 × 2,597,034) gas × 1.1 Mwei × the exchange rate, rounded up.
    expect(funding.quotedFeeUsdc).toBe(15_477n)
    expect(funding.incomingUsdc).toBe(15_477n)
  })

  it('funds the shortfall when the HCA cannot cover the fee', async () => {
    // Registration leaves the HCA with ~nothing, so this is the normal case.
    mockReads({ hcaBalance: 0n })

    const funding = await planHcaIntentFunding(params)

    expect(funding.quotedFeeUsdc).toBe(900_000n)
    expect(funding.incomingUsdc).toBe(900_000n)
    expect(funding.auxiliaryFunds).toEqual({
      [sepolia.id]: { [C.usdc]: 900_000n },
    })

    // permit -> transferFrom -> action, in that order.
    expect(funding.calls).toHaveLength(3)
    expect(fnNameOf(funding.calls[0])).toBe('permit')
    expect(fnNameOf(funding.calls[1])).toBe('transferFrom')
    expect(funding.calls[2]).toEqual(actionCalls[0])
  })

  it('permits only the shortfall, not the whole fee', async () => {
    // Double-charging a standing balance would move more of the user's USDC
    // into the HCA than the action needs.
    mockReads({ hcaBalance: 400_000n })

    const funding = await planHcaIntentFunding(params)

    expect(funding.incomingUsdc).toBe(500_000n)
    expect(signFundingPermit.mock.calls[0]?.[0]).toMatchObject({
      wallet: OWNER,
      hca: HCA,
      value: 500_000n,
    })
  })

  it('skips funding entirely when the HCA already covers the fee', async () => {
    mockReads({ hcaBalance: 5_000_000n })

    const funding = await planHcaIntentFunding(params)

    expect(funding.calls).toEqual(actionCalls)
    expect(funding.incomingUsdc).toBeUndefined()
    expect(funding.auxiliaryFunds).toBeUndefined()
    expect(signFundingPermit).not.toHaveBeenCalled()
  })

  it('quotes the FUNDED batch, so the permit is not sized against a smaller one', async () => {
    // The fee is charged for the batch that actually fills. Quoting the bare
    // action would under-size the permit by the funding pair's own cost — the
    // same class of bug as quoting a reveal without its primary-name call.
    mockReads({ hcaBalance: 0n })

    await planHcaIntentFunding(params)

    const quoted = prepareTransaction.mock.calls[0]?.[0] as {
      calls: Call[]
      gasLimit: bigint
      sponsored: unknown
      feeAsset: string
    }

    expect(quoted.calls).toHaveLength(3)
    expect(fnNameOf(quoted.calls[0])).toBe('permit')
    expect(quoted.gasLimit).toBe(HCA_STANDALONE_INTENT_GAS_LIMIT)
    // Never sponsored — this route is user-paid in USDC.
    expect(quoted.sponsored).toEqual({
      gas: false,
      bridging: false,
      swaps: false,
    })
    expect(quoted.feeAsset).toBe('USDC')
  })

  it('declares a first-pass inflow so an empty HCA can be priced at all', async () => {
    // The planner credits only balances it can already see and refuses to
    // quote an account below the fee, so an empty HCA needs the declaration.
    mockReads({ hcaBalance: 0n })

    await planHcaIntentFunding(params)

    const quoted = prepareTransaction.mock.calls[0]?.[0] as {
      auxiliaryFunds?: Record<number, Record<Address, bigint>>
    }
    expect(quoted.auxiliaryFunds?.[sepolia.id]?.[C.usdc]).toBeGreaterThan(0n)
  })

  it('declares an inflow for a dust balance too, not just an empty one', async () => {
    // 0.3 USDC against a 0.9 fee is exactly as unpriceable to the planner as
    // an empty account — and it is where a settled registration leaves the
    // HCA. Keying the declaration on "exactly zero" made this band throw.
    mockReads({ hcaBalance: 300_000n })

    const funding = await planHcaIntentFunding(params)

    const quoted = prepareTransaction.mock.calls[0]?.[0] as {
      auxiliaryFunds?: Record<number, Record<Address, bigint>>
    }
    expect(quoted.auxiliaryFunds?.[sepolia.id]?.[C.usdc]).toBeGreaterThan(0n)
    // And the permit still covers only what the HCA is actually short.
    expect(funding.incomingUsdc).toBe(600_000n)
  })

  it('declares a first-pass inflow that scales with the declared limit', async () => {
    // The planner prices the fee on the declared limit, so the placeholder has
    // to scale with it: a 25-name renewal batch quotes ~9 USDC, above anything
    // sized for the 300k shape, and under-declaring makes the quote fail before
    // the user is ever asked to fund the batch.
    mockReads({ hcaBalance: 0n })
    const gasLimit = 3_100_000n
    const requiredUsdc = 2_000_000n

    await planHcaIntentFunding({
      ...params,
      gasLimit,
      requiredUsdc,
      maxFeeUsdc: hcaMaxIntentFeeUsdcFor(gasLimit),
    })

    const quoted = prepareTransaction.mock.calls[0]?.[0] as {
      auxiliaryFunds?: Record<number, Record<Address, bigint>>
    }
    // What the batch spends, plus the fee ceiling for its own limit.
    expect(quoted.auxiliaryFunds?.[sepolia.id]?.[C.usdc]).toBe(
      requiredUsdc + hcaMaxIntentFeeUsdcFor(gasLimit),
    )
  })

  it('throws rather than guessing when the quote cannot be priced', async () => {
    // A wrong permit either under-funds (the fill reverts) or moves more of
    // the user's USDC than the action needed.
    mockReads({ hcaBalance: 0n })
    prepareTransaction.mockResolvedValue({ intentRoute: {} })

    await expect(planHcaIntentFunding(params)).rejects.toThrow(
      /cannot be sized/,
    )
    expect(signFundingPermit).not.toHaveBeenCalled()
  })

  it('throws rather than treating an unreadable balance as empty', async () => {
    // An unread balance is unknown, not zero. Defaulting it to zero sizes the
    // permit for the whole fee and pulls USDC out of the owner's wallet that
    // the HCA may already have been holding.
    readContract.mockRejectedValue(new Error('rpc down'))

    await expect(planHcaIntentFunding(params)).rejects.toThrow()
    expect(signFundingPermit).not.toHaveBeenCalled()
  })

  it('requests no signature for a fee above the expected maximum', async () => {
    // The fee is parsed out of an orchestrator HTTP response and becomes the
    // value of an EIP-2612 permit. A response that names an absurd figure must
    // stop here, not reach the wallet.
    mockReads({ hcaBalance: 0n })
    prepareTransaction.mockResolvedValue(
      quoteOf(HCA_MAX_STANDALONE_INTENT_FEE_USDC + 1n),
    )

    await expect(planHcaIntentFunding(params)).rejects.toThrow(
      /above the expected maximum/,
    )
    expect(signFundingPermit).not.toHaveBeenCalled()
  })

  it('shows the amount before asking for the signature', async () => {
    mockReads({ hcaBalance: 400_000n })
    const order: string[] = []
    const confirmFunding = vi.fn((prompt: HcaFundingPrompt) => {
      order.push('confirm')
      return prompt.permitValue > 0n
    })
    signFundingPermit.mockImplementation(() => {
      order.push('sign')
      return {
        match: (ok: (v: unknown) => unknown) =>
          ok({
            owner: OWNER,
            spender: HCA,
            value: 500_000n,
            deadline: 1_800_000_000n,
            v: 27,
            r: `0x${'11'.repeat(32)}` as Hex,
            s: `0x${'22'.repeat(32)}` as Hex,
          }),
      }
    })

    await planHcaIntentFunding({ ...params, confirmFunding })

    // Shown first, and shown the EXACT value the permit authorizes — not the
    // fee, which the standing balance partly covers.
    expect(order).toEqual(['confirm', 'sign'])
    expect(confirmFunding).toHaveBeenCalledWith({
      permitValue: 500_000n,
      requiresPermit: true,
      quotedFeeUsdc: 900_000n,
      hcaBalanceUsdc: 400_000n,
      requiredUsdc: 0n,
    })
  })

  it('requests no signature when the user declines the amount', async () => {
    mockReads({ hcaBalance: 0n })

    await expect(
      planHcaIntentFunding({ ...params, confirmFunding: () => false }),
    ).rejects.toThrow(HcaFundingDeclinedError)
    expect(signFundingPermit).not.toHaveBeenCalled()
  })

  it('does not prompt when no funding is needed', async () => {
    // Nothing is being permitted, so there is nothing to consent to.
    mockReads({ hcaBalance: 5_000_000n })
    const confirmFunding = vi.fn(() => true)

    await planHcaIntentFunding({ ...params, confirmFunding })

    expect(confirmFunding).not.toHaveBeenCalled()
  })

  it('bounds the permit it asks for against the standalone ceiling', async () => {
    mockReads({ hcaBalance: 400_000n })

    await planHcaIntentFunding(params)

    // The actor re-checks the value it is handed, so the ceiling travels with
    // the request rather than living only in this function.
    expect(signFundingPermit.mock.calls[0]?.[0]).toMatchObject({
      value: 500_000n,
      bounds: {
        expectedMaximum: HCA_MAX_STANDALONE_INTENT_FEE_USDC - 400_000n,
        displayedValue: 500_000n,
      },
    })
  })

  it('quotes against the declared gas limit and its scaled fee ceiling', async () => {
    mockReads({ hcaBalance: 0n })
    const gasLimit = 1_200_000n
    // 15 USDC is above the 300k ceiling but legitimately below the ceiling for
    // 1.2M: the rail prices on the declared limit, so the bound must come from
    // the same limit or it rejects a fee the intent really costs.
    prepareTransaction.mockResolvedValue(quoteOf(15_000_000n))

    await expect(planHcaIntentFunding({ ...params, gasLimit })).rejects.toThrow(
      /above the expected maximum/,
    )

    const funding = await planHcaIntentFunding({
      ...params,
      gasLimit,
      maxFeeUsdc: hcaMaxIntentFeeUsdcFor(gasLimit),
    })

    expect(prepareTransaction.mock.calls[0]?.[0]).toMatchObject({ gasLimit })
    expect(funding.quotedFeeUsdc).toBe(15_000_000n)
  })
})

describe('hcaMaxIntentFeeUsdcFor', () => {
  it('keeps the standalone anchor, scaled down for smaller shapes', () => {
    expect(hcaMaxIntentFeeUsdcFor(HCA_STANDALONE_INTENT_GAS_LIMIT)).toBe(
      HCA_MAX_STANDALONE_INTENT_FEE_USDC,
    )
    expect(hcaMaxIntentFeeUsdcFor(150_000n)).toBe(5_000_000n)
    // Rounded up, so a fee at the ceiling is never rejected.
    expect(hcaMaxIntentFeeUsdcFor(150_001n)).toBe(5_000_034n)
  })

  it('adds only the per-million-gas rate above the anchor', () => {
    // The single-renewal base and a full 25-name chunk: ~4x their measured
    // ~3.2 and ~9.3 USDC fees, rather than the anchor's rate scaled to ~100.
    expect(hcaMaxIntentFeeUsdcFor(600_000n)).toBe(13_000_000n)
    expect(hcaMaxIntentFeeUsdcFor(3_000_000n)).toBe(37_000_000n)
  })
})

describe('planHcaIntentFunding for an intent that also buys something', () => {
  // A renewal pays rent out of the same USDC balance as the rail's own fee, so
  // sizing the funding on the fee alone leaves the action unfunded.
  const rentParams = { ...params, requiredUsdc: 2_000_000n }

  it('funds the rent and the fee together', async () => {
    mockReads({ hcaBalance: 400_000n })

    const funding = await planHcaIntentFunding(rentParams)

    // 2.0 rent + 0.9 fee = 2.9 needed, minus the 0.4 the HCA already holds.
    expect(funding.incomingUsdc).toBe(2_500_000n)
    expect(signFundingPermit.mock.calls[0]?.[0]).toMatchObject({
      value: 2_500_000n,
    })
  })

  it('shows the rent as part of what the permit authorizes', async () => {
    mockReads({ hcaBalance: 0n })
    const confirmFunding = vi.fn(() => true)

    await planHcaIntentFunding({ ...rentParams, confirmFunding })

    expect(confirmFunding).toHaveBeenCalledWith(
      expect.objectContaining({
        permitValue: 2_900_000n,
        requiredUsdc: 2_000_000n,
      }),
    )
  })

  it('bounds the permit over the rent plus the bounded fee', async () => {
    mockReads({ hcaBalance: 0n })

    await planHcaIntentFunding(rentParams)

    expect(signFundingPermit.mock.calls[0]?.[0]).toMatchObject({
      value: 2_900_000n,
      bounds: {
        expectedMaximum: 2_000_000n + HCA_MAX_STANDALONE_INTENT_FEE_USDC,
        displayedValue: 2_900_000n,
      },
    })
  })

  it('submits the bare action when the HCA covers the rent and the fee', async () => {
    mockReads({ hcaBalance: 5_000_000n })

    const funding = await planHcaIntentFunding(rentParams)

    expect(funding.calls).toEqual(actionCalls)
    expect(funding.incomingUsdc).toBeUndefined()
    expect(signFundingPermit).not.toHaveBeenCalled()
  })

  it('pulls with a standing allowance instead of a permit, after showing the amount', async () => {
    // No permit is needed, but the USDC still leaves the wallet when the
    // intent fills, so the user sees the figure before signing it.
    mockReads({
      hcaBalance: 400_000n,
      allowance: 9_000_000n,
      walletBalance: 9_000_000n,
    })
    const confirmFunding = vi.fn(() => true)

    const funding = await planHcaIntentFunding({
      ...rentParams,
      confirmFunding,
    })

    expect(signFundingPermit).not.toHaveBeenCalled()
    expect(confirmFunding).toHaveBeenCalledWith(
      expect.objectContaining({
        permitValue: 2_500_000n,
        requiresPermit: false,
      }),
    )
    expect(funding.calls).toHaveLength(2)
    expect(fnNameOf(funding.calls[0])).toBe('transferFrom')
    expect(funding.calls[1]).toEqual(actionCalls[0])
    expect(funding.incomingUsdc).toBe(2_500_000n)
    expect(funding.auxiliaryFunds).toEqual({
      [sepolia.id]: { [C.usdc]: 2_500_000n },
    })
  })

  it('builds nothing when the user declines an allowance-funded amount', async () => {
    mockReads({
      hcaBalance: 400_000n,
      allowance: 9_000_000n,
      walletBalance: 9_000_000n,
    })

    await expect(
      planHcaIntentFunding({ ...rentParams, confirmFunding: () => false }),
    ).rejects.toThrow(HcaFundingDeclinedError)
    expect(signFundingPermit).not.toHaveBeenCalled()
  })

  it('falls back to a permit when the standing allowance is short', async () => {
    mockReads({
      hcaBalance: 400_000n,
      allowance: 2_499_999n,
      walletBalance: 9_000_000n,
    })
    const confirmFunding = vi.fn(() => true)

    const funding = await planHcaIntentFunding({
      ...rentParams,
      confirmFunding,
    })

    // One wei short is short: the partial allowance cannot be relied on to
    // cover a pull that the fill needs in full.
    expect(confirmFunding).toHaveBeenCalledWith(
      expect.objectContaining({ requiresPermit: true }),
    )
    expect(fnNameOf(funding.calls[0])).toBe('permit')
  })

  it('names the wallet balance when a standing allowance cannot be pulled', async () => {
    // Allowance present but the USDC is not: fail here rather than let the fill
    // revert with an opaque SafeERC20 error.
    mockReads({
      hcaBalance: 0n,
      allowance: 9_000_000n,
      walletBalance: 1_000_000n,
    })

    await expect(planHcaIntentFunding(rentParams)).rejects.toThrow(
      /connected wallet holds/,
    )
    expect(signFundingPermit).not.toHaveBeenCalled()
  })
})

describe('planHcaIntentFunding for a spend in another token', () => {
  // A renewal paid in DAI: the rent is a leg of its own, the fee stays USDC.
  const DAI = '0x00000000000000000000000000000000000000da' as Address
  const ONE_DAI = 10n ** 18n
  const daiParams = {
    ...params,
    tokenSpend: {
      token: DAI,
      symbol: 'DAI',
      decimals: 18,
      amount: 2n * ONE_DAI,
    },
  }

  /** Each call's target and decoded function name. */
  const shapeOf = (calls: readonly Call[]) =>
    calls.map((call) =>
      call.to === ACTION_TARGET ? 'action' : `${call.to}:${fnNameOf(call)}`,
    )

  it('funds the token and the fee as separate legs, token first', async () => {
    const funding = await planHcaIntentFunding(daiParams)

    expect(shapeOf(funding.calls)).toEqual([
      `${DAI}:permit`,
      `${DAI}:transferFrom`,
      `${C.usdc}:permit`,
      `${C.usdc}:transferFrom`,
      'action',
    ])
    // The rent never enters the USDC funding: only the fee is pulled in USDC.
    expect(funding.incomingUsdc).toBe(900_000n)
    expect(funding.auxiliaryFunds).toEqual({
      [sepolia.id]: { [C.usdc]: 900_000n },
    })
    expect(
      signFundingPermit.mock.calls.map(([input]) => [
        input.token.address,
        input.value,
      ]),
    ).toEqual([
      [DAI, 2n * ONE_DAI],
      [C.usdc, 900_000n],
    ])
    // And the quote is taken over that same, fully funded shape.
    expect(prepareTransaction.mock.calls[0]?.[0].calls).toHaveLength(5)
  })

  it('shows both legs in one prompt before any signature', async () => {
    mockReads({ tokens: { [DAI]: { hcaBalance: ONE_DAI / 2n } } })
    const order: string[] = []
    const confirmFunding = vi.fn(() => {
      order.push('confirm')
      return true
    })
    signFundingPermit.mockImplementation(() => {
      order.push('sign')
      return signedPermit()
    })

    await planHcaIntentFunding({ ...daiParams, confirmFunding })

    expect(order).toEqual(['confirm', 'sign', 'sign'])
    expect(confirmFunding).toHaveBeenCalledWith({
      permitValue: 900_000n,
      requiresPermit: true,
      quotedFeeUsdc: 900_000n,
      hcaBalanceUsdc: 0n,
      requiredUsdc: 0n,
      token: {
        symbol: 'DAI',
        decimals: 18,
        required: 2n * ONE_DAI,
        hcaBalance: ONE_DAI / 2n,
        permitValue: (3n * ONE_DAI) / 2n,
        requiresPermit: true,
      },
    })
  })

  it('funds only the fee when the account already holds the token', async () => {
    mockReads({ tokens: { [DAI]: { hcaBalance: 2n * ONE_DAI } } })

    const funding = await planHcaIntentFunding(daiParams)

    expect(shapeOf(funding.calls)).toEqual([
      `${C.usdc}:permit`,
      `${C.usdc}:transferFrom`,
      'action',
    ])
  })

  it('pulls the token under a standing allowance without a permit', async () => {
    mockReads({ tokens: { [DAI]: { allowance: 2n * ONE_DAI } } })

    const funding = await planHcaIntentFunding(daiParams)

    expect(shapeOf(funding.calls).slice(0, 2)).toEqual([
      `${DAI}:transferFrom`,
      `${C.usdc}:permit`,
    ])
  })

  it('checks the wallet holds every leg before showing anything', async () => {
    // Short of DAI: refusing here beats a prompt the fill can't honour, or a
    // first permit signed for nothing.
    mockReads({ tokens: { [DAI]: { walletBalance: ONE_DAI } } })
    const confirmFunding = vi.fn(() => true)

    await expect(
      planHcaIntentFunding({ ...daiParams, confirmFunding }),
    ).rejects.toThrow(/wallet holds 1 DAI/)
    expect(confirmFunding).not.toHaveBeenCalled()
    expect(signFundingPermit).not.toHaveBeenCalled()
  })

  describe('with mainnet DAI’s legacy permit', () => {
    const daiPermitAbi = parseAbi([
      'function permit(address holder, address spender, uint256 nonce, uint256 expiry, bool allowed, uint8 v, bytes32 r, bytes32 s)',
    ])
    const legacyParams = {
      ...daiParams,
      tokenSpend: {
        ...daiParams.tokenSpend,
        permitKind: 'dai-legacy' as const,
      },
    }

    it('encodes DAI’s own permit, not EIP-2612’s', async () => {
      const funding = await planHcaIntentFunding(legacyParams)

      const [permitCall] = funding.calls
      expect(permitCall?.data.slice(0, 10)).toBe('0x8fcbaf0c')
      expect(
        decodeFunctionData({ abi: daiPermitAbi, data: permitCall?.data as Hex })
          .args,
      ).toEqual([
        OWNER,
        getAddress(HCA),
        4n,
        1_800_000_000n,
        true,
        27,
        signature.r,
        signature.s,
      ])
      expect(signFundingPermit.mock.calls[0]?.[0].token.permitKind).toBe(
        'dai-legacy',
      )
      // The USDC fee leg keeps its exact-value EIP-2612 permit.
      expect(signFundingPermit.mock.calls[1]?.[0].token.permitKind).toBe(
        'eip2612',
      )
    })

    it('quotes against the legacy permit’s longer calldata', async () => {
      await planHcaIntentFunding(legacyParams)

      const quoted: Call[] = prepareTransaction.mock.calls[0]?.[0].calls
      const daiPlaceholder = quoted.find(
        (call) => call.to === DAI && call.data.startsWith('0x8fcbaf0c'),
      )
      expect(daiPlaceholder).toBeDefined()
    })

    it('tells the prompt the allowance is unlimited', async () => {
      const confirmFunding = vi.fn(() => true)

      await planHcaIntentFunding({ ...legacyParams, confirmFunding })

      expect(confirmFunding).toHaveBeenCalledWith(
        expect.objectContaining({
          token: expect.objectContaining({
            requiresPermit: true,
            hasUnlimitedAllowance: true,
          }),
        }),
      )
    })

    it('skips the permit once its unlimited allowance stands', async () => {
      // DAI never decrements a max allowance, so later renewals just pull.
      mockReads({ tokens: { [DAI]: { allowance: 2n ** 256n - 1n } } })
      const confirmFunding = vi.fn(() => true)

      const funding = await planHcaIntentFunding({
        ...legacyParams,
        confirmFunding,
      })

      expect(shapeOf(funding.calls)[0]).toBe(`${DAI}:transferFrom`)
      expect(confirmFunding.mock.calls[0]?.[0].token).not.toHaveProperty(
        'hasUnlimitedAllowance',
      )
    })
  })

  it('folds a USDC spend into the fee funding', async () => {
    const funding = await planHcaIntentFunding({
      ...params,
      tokenSpend: {
        token: C.usdc,
        symbol: 'USDC',
        decimals: 6,
        amount: 2_000_000n,
      },
    })

    expect(funding.incomingUsdc).toBe(2_900_000n)
    expect(shapeOf(funding.calls)).toEqual([
      `${C.usdc}:permit`,
      `${C.usdc}:transferFrom`,
      'action',
    ])
  })
})

describe('explicit renewal permit validation', () => {
  it('stops at a failed permit preflight instead of returning a rejected permit', async () => {
    prepareTransaction.mockResolvedValue({
      intentRoute: {
        intentCost: {
          tokensSpent: {
            '1': {
              [getDestinationContracts(1).usdc.toLowerCase()]: {
                locked: '0',
                unlocked: '900000',
              },
            },
          },
        },
      },
    })
    const failure = new Error('RPC disconnected during permit validation')
    const simulateContract = vi.fn().mockRejectedValue(failure)
    const confirmApproval = vi.fn(() => true)
    await expect(
      planHcaIntentFunding({
        ...params,
        chainId: 1,
        publicClient: {
          ...publicClient,
          chain: mainnet,
          simulateContract,
          getBlockNumber: async () => 42n,
        },
        approvalFallback: {
          confirmApproval,
          environment: {
            storage: {
              getItem: () => null,
              setItem: () => undefined,
              removeItem: () => undefined,
            },
            locks: {
              request: vi.fn(async (_name, _options, callback) =>
                callback({ name: 'test', mode: 'exclusive' }),
              ),
            },
          },
        },
      }),
    ).rejects.toThrow('RPC disconnected during permit validation')
    expect(confirmApproval).not.toHaveBeenCalled()
  })
})

it('refreshes HCA balances after recovering a pending approval instead of pulling a stale shortfall', async () => {
  prepareTransaction.mockResolvedValue({
    intentRoute: {
      intentCost: {
        tokensSpent: {
          '1': {
            [getDestinationContracts(1).usdc.toLowerCase()]: {
              locked: '0',
              unlocked: '900000',
            },
          },
        },
      },
    },
  })
  const pending = {
    kind: 'submitted',
    amount: '900000',
    hash: `0x${'11'.repeat(32)}`,
  }
  const walletClient = {
    ...createWalletClient({
      chain: mainnet,
      transport: custom({ request: async () => undefined }),
    }),
    getAddresses: vi.fn().mockResolvedValue([OWNER]),
    getChainId: vi.fn().mockResolvedValue(1),
  }
  const client = {
    ...publicClient,
    chain: mainnet,
    readContract: vi.fn().mockResolvedValue(900_000n),
    waitForTransactionReceipt: vi.fn().mockImplementation(async () => {
      mockReads({ hcaBalance: 900_000n, allowance: 900_000n })
      return { status: 'success' }
    }),
  }
  const funding = await planHcaIntentFunding({
    ...params,
    chainId: 1,
    publicClient: client,
    approvalSigner: { type: 'eoa', walletClient },
    approvalFallback: {
      confirmApproval: () => true,
      environment: {
        storage: {
          getItem: () => JSON.stringify(pending),
          setItem: () => undefined,
          removeItem: () => undefined,
        },
        locks: {
          request: vi.fn(
            async (_name, _options, callback) =>
              await callback({ name: 'test', mode: 'exclusive' }),
          ),
        },
      },
    },
  })
  expect(funding.calls).toEqual(actionCalls)
  expect(funding.incomingUsdc).toBeUndefined()
  expect(signFundingPermit).not.toHaveBeenCalled()
})
