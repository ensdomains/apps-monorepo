/**
 * Warp Transport Actor Tests
 *
 * Tests for submitWarpTransaction — the Warp intent-based transport.
 */

import type { RhinestoneAccount } from '@rhinestone/sdk'
import type { Address, Hash, Hex } from 'viem'
import { decodeFunctionData, encodeFunctionData, parseAbi } from 'viem'
import { baseSepolia, sepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TransactionSubmissionError } from '../errors/transaction.errors'
import type { RhinestoneSigner } from '../types/signer.types'
import type {
  EOATransactionRequest,
  RhinestoneTransactionRequest,
} from '../types/transaction.types'
import { submitWarpTransaction } from './warp-transport.actor'

// ── Fixtures ───────────────────────────────────────────────────────────

const MOCK_TX_HASH =
  '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hash

const MOCK_CALLS = [
  {
    to: '0xTarget12345678901234567890123456789012345678' as Address,
    data: '0xdeadbeef' as Hex,
    value: 0n,
  },
]

/** Scoped SmartSession object the SDK signs Intents with. */
const MOCK_SESSION = {
  owners: {
    type: 'ecdsa',
    accounts: [{ address: '0x5555555555555555555555555555555555555555' }],
  },
} as unknown as NonNullable<RhinestoneSigner['session']>['session']

function createMockSigner(): RhinestoneSigner {
  return {
    type: 'rhinestone',
    account: {
      sendTransaction: vi.fn().mockResolvedValue('mock-intent-id'),
      sendUserOperation: vi.fn().mockResolvedValue('mock-userop-result'),
      waitForExecution: vi.fn().mockImplementation((result: unknown) => {
        // Return different shapes based on which method was called
        if (result === 'mock-userop-result') {
          return { receipt: { transactionHash: MOCK_TX_HASH } }
        }
        return { fill: { hash: MOCK_TX_HASH } }
      }),
    } as unknown as RhinestoneAccount,
    config: {
      rhinestoneApiKey: 'test-key',
      chain: sepolia,
      defaultInfra: 'warp',
    },
  }
}

function createRhinestoneRequest(
  overrides: Partial<RhinestoneTransactionRequest> = {},
): RhinestoneTransactionRequest {
  return {
    type: 'rhinestone-intent',
    from: '0xFrom1234567890123456789012345678901234' as Address,
    chainId: 11155111,
    rhinestoneParams: {
      calls: MOCK_CALLS,
    },
    ...overrides,
  }
}

// ── Cross-chain fixtures ───────────────────────────────────────────────

type MockFn = ReturnType<typeof vi.fn>

const WALLET = '0x1111111111111111111111111111111111111111' as Address
const NEXUS = '0x2222222222222222222222222222222222222222' as Address
const SOURCE_USDC = '0x3333333333333333333333333333333333333333' as Address
const DEST_USDC = '0x4444444444444444444444444444444444444444' as Address
const HCA_CONFIG = { account: { type: 'standalone-hca' } } as never
const SOURCE_CAP = 9_000_000n

const fundingAbi = parseAbi([
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
])

/**
 * A prepared route whose Permit2 claim is `claim` of the source token.
 *
 * `idsAndAmounts` ids pack the token address in their low 160 bits, which is
 * how the transport reads back what the route will actually claim.
 */
function preparedWithClaim(claim: bigint) {
  return {
    intentRoute: {
      intentOp: {
        elements: [
          {
            idsAndAmounts: [[BigInt(SOURCE_USDC).toString(), claim.toString()]],
          },
        ],
      },
    },
  }
}

function createCrossChainContext(): NonNullable<
  RhinestoneSigner['crossChain']
> {
  return {
    account: {
      // Default: the route claims exactly what it is handed, so the loop
      // settles on the first attempt.
      prepareTransaction: vi
        .fn()
        .mockImplementation(async (tx: { sourceCalls: never }) =>
          preparedWithClaim(pullAmountOf(tx as never)),
        ),
      signTransaction: vi.fn().mockResolvedValue('mock-signed'),
      submitTransaction: vi.fn().mockResolvedValue('mock-intent-id'),
      waitForExecution: vi.fn().mockResolvedValue({
        fill: { hash: MOCK_TX_HASH },
      }),
    } as unknown as RhinestoneAccount,
    address: NEXUS,
    recipient: HCA_CONFIG,
    chainId: baseSepolia.id,
    sourceToken: SOURCE_USDC,
    destinationToken: DEST_USDC,
  }
}

/**
 * The orchestrator's 422 when the destination fee exceeds the delivery. The
 * enumerable `context` is what carries the numbers — none of it is in
 * `Error.message`.
 */
function feeExceedsBalanceError(gasCostEstimate: bigint): Error {
  return Object.assign(
    new Error('Transfer amount is too small to cover gas overhead'),
    {
      errorType: 'Unprocessable Entity',
      statusCode: 422,
      context: {
        domain: 'planning',
        code: 'FEE_EXCEEDS_BALANCE',
        gasCostEstimate: gasCostEstimate.toString(),
        inputTokenSymbol: 'USDC',
      },
    },
  )
}

/** The `transferFrom` amount inside a transaction's source calls. */
// biome-ignore lint/suspicious/noExplicitAny: reaching into SDK-shaped params
function pullAmountOf(tx: any): bigint {
  for (const call of tx.sourceCalls?.[baseSepolia.id] ?? []) {
    const decoded = decodeFunctionData({ abi: fundingAbi, data: call.data })
    if (decoded.functionName === 'transferFrom') return decoded.args[2]
  }
  throw new Error('no wallet pull in source calls')
}

const MOCK_ENABLE_DATA = {
  userSignature: `0x${'ee'.repeat(65)}` as Hex,
  hashesAndChainIds: [],
  sessionToEnableIndex: 0,
} as never

const MOCK_SOURCE_ENABLE_DATA = {
  userSignature: `0x${'aa'.repeat(65)}` as Hex,
  hashesAndChainIds: [],
  sessionToEnableIndex: 1,
} as never

/**
 * The per-chain signer set a multi-chain session produces.
 *
 * `buildSessionContext` bakes a proof into BOTH entries unconditionally — it
 * has no way to know which leg is being submitted — which is what makes the
 * per-request gating in the transport load-bearing.
 */
function crossChainSessionSet(): NonNullable<RhinestoneSigner['session']> {
  return {
    type: 'experimental_session',
    sessions: {
      [sepolia.id]: {
        session: MOCK_SESSION,
        enableData: MOCK_ENABLE_DATA,
        verifyExecutions: true,
      },
      // The source leg only moves funds; its executions are checked by the
      // funding validator itself.
      [baseSepolia.id]: {
        session: MOCK_SESSION,
        enableData: MOCK_SOURCE_ENABLE_DATA,
        verifyExecutions: false,
      },
    },
    verifyExecutions: true,
  } as unknown as NonNullable<RhinestoneSigner['session']>
}

function crossChainRequest(): RhinestoneTransactionRequest {
  return createRhinestoneRequest({
    rhinestoneParams: {
      calls: MOCK_CALLS,
      sponsored: { gas: false, bridging: false, swaps: false },
      feeAsset: 'USDC',
      gasLimit: 1_200_000n,
      sourceChainId: baseSepolia.id,
      tokenRequests: [{ address: DEST_USDC, amount: 6_000_000n }],
      sourceAssets: [
        { chainId: baseSepolia.id, address: SOURCE_USDC, amount: SOURCE_CAP },
      ],
      auxiliaryFunds: { [baseSepolia.id]: { [SOURCE_USDC]: SOURCE_CAP } },
      sourceCalls: {
        [baseSepolia.id]: [
          {
            to: SOURCE_USDC,
            value: 0n,
            data: encodeFunctionData({
              abi: fundingAbi,
              functionName: 'permit',
              args: [
                WALLET,
                NEXUS,
                SOURCE_CAP,
                1_800_000_000n,
                27,
                `0x${'11'.repeat(32)}` as Hex,
                `0x${'22'.repeat(32)}` as Hex,
              ],
            }),
          },
          {
            to: SOURCE_USDC,
            value: 0n,
            data: encodeFunctionData({
              abi: fundingAbi,
              functionName: 'transferFrom',
              args: [WALLET, NEXUS, SOURCE_CAP],
            }),
          },
        ],
      },
    },
  })
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('submitWarpTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns error for non-rhinestone-intent request type', async () => {
    const signer = createMockSigner()
    const request: EOATransactionRequest = {
      type: 'eoa',
      from: '0xFrom1234567890123456789012345678901234' as Address,
      to: '0xTo12345678901234567890123456789012345678' as Address,
      chainId: 11155111,
    }

    const result = await submitWarpTransaction({ request, signer })

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(TransactionSubmissionError)
    expect(result._unsafeUnwrapErr().message).toContain(
      'Warp transport requires rhinestone-intent request',
    )
  })

  it('returns error for empty calls array', async () => {
    const signer = createMockSigner()
    const request = createRhinestoneRequest({
      rhinestoneParams: { calls: [] },
    })

    const result = await submitWarpTransaction({ request, signer })

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(TransactionSubmissionError)
    expect(result._unsafeUnwrapErr().message).toContain(
      'calls is required and must not be empty',
    )
  })

  it('owner-signed (no session): omits `signers` so the SDK uses the owner validator', async () => {
    const signer = createMockSigner()
    const request = createRhinestoneRequest()

    await submitWarpTransaction({ request, signer })

    expect(signer.account.sendTransaction).toHaveBeenCalledWith({
      sourceChains: [sepolia],
      targetChain: sepolia,
      calls: MOCK_CALLS,
      sponsored: { gas: false, bridging: false, swaps: false },
      feeAsset: 'USDC',
      tokenRequests: [],
    })
    // No active session → `signers` must not be passed.
    expect(signer.account.sendTransaction).not.toHaveBeenCalledWith(
      expect.objectContaining({ signers: expect.anything() }),
    )
  })

  it('session attached: signs the Intent with the scoped session (experimental_session)', async () => {
    const signer = createMockSigner()
    signer.session = { session: MOCK_SESSION }
    const request = createRhinestoneRequest()

    await submitWarpTransaction({ request, signer })

    expect(signer.account.sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        signers: {
          type: 'experimental_session',
          session: MOCK_SESSION,
          verifyExecutions: true,
        },
      }),
    )
  })

  it('attaches enableData only on the request that carries it (first HCA action)', async () => {
    const signer = createMockSigner()
    signer.session = { session: MOCK_SESSION }
    const sessionEnableData = { mode: 'enable' } as never
    const request = createRhinestoneRequest({
      rhinestoneParams: {
        calls: MOCK_CALLS,
        feeAsset: 'USDC',
        sessionEnableData,
      },
    })

    await submitWarpTransaction({ request, signer })

    expect(signer.account.sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        signers: {
          type: 'experimental_session',
          session: MOCK_SESSION,
          enableData: sessionEnableData,
          verifyExecutions: true,
        },
        // User-paid standalone-HCA route: no sponsorship, fees in USDC.
        sponsored: { gas: false, bridging: false, swaps: false },
        feeAsset: 'USDC',
      }),
    )
  })

  it('rejects enableData without an active session (it can only ride a session signer)', async () => {
    const signer = createMockSigner()
    const request = createRhinestoneRequest({
      rhinestoneParams: {
        calls: MOCK_CALLS,
        sessionEnableData: { mode: 'enable' } as never,
      },
    })

    const result = await submitWarpTransaction({ request, signer })

    expect(result._unsafeUnwrapErr()).toBeInstanceOf(TransactionSubmissionError)
    expect(result._unsafeUnwrapErr().message).toContain(
      'requires a signer with an active session',
    )
    expect(signer.account.sendTransaction).not.toHaveBeenCalled()
  })

  it('calls waitForExecution and returns receipt.fill.hash', async () => {
    const signer = createMockSigner()
    const request = createRhinestoneRequest()

    const result = await submitWarpTransaction({ request, signer })

    expect(signer.account.waitForExecution).toHaveBeenCalledWith(
      'mock-intent-id',
      false,
    )
    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toBe(MOCK_TX_HASH)
  })

  it('always sends the user-paid shape — sponsorship is not requestable', async () => {
    // Gas sponsorship does not exist on this deployment, and there is no
    // caller-facing knob or env flag to turn it on. This used to default to
    // `true` whenever `sponsored` was omitted, so every new call site
    // silently asked for a subsidy no relayer here offers.
    const signer = createMockSigner()
    const request = createRhinestoneRequest({
      rhinestoneParams: { calls: MOCK_CALLS },
    })

    await submitWarpTransaction({ request, signer })

    expect(signer.account.sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        sponsored: { gas: false, bridging: false, swaps: false },
        feeAsset: 'USDC',
      }),
    )
  })

  it('returns TransactionSubmissionError on SDK failure', async () => {
    const signer = createMockSigner()
    ;(
      signer.account.sendTransaction as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('Network error'))
    const request = createRhinestoneRequest()

    const result = await submitWarpTransaction({ request, signer })

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(TransactionSubmissionError)
  })

  it('returns error when no hash in execution receipt', async () => {
    const signer = createMockSigner()
    ;(
      signer.account.waitForExecution as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      fill: { hash: undefined },
    })
    const request = createRhinestoneRequest()

    const result = await submitWarpTransaction({ request, signer })

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(TransactionSubmissionError)
    expect(result._unsafeUnwrapErr().message).toContain(
      'No transaction hash returned',
    )
  })

  it('collapses a multi-chain session to one entry for a same-chain intent', async () => {
    const signer = createMockSigner()
    // The session authorization is multi-chain for EVERYONE — it is signed
    // before the user picks a payment route — so a same-chain registration
    // also arrives here with a per-chain signer set.
    signer.session = crossChainSessionSet()
    const request = createRhinestoneRequest({
      rhinestoneParams: {
        calls: MOCK_CALLS,
        sponsored: { gas: false, bridging: false, swaps: false },
        feeAsset: 'USDC',
        sessionEnableData: MOCK_ENABLE_DATA,
      },
    })

    await submitWarpTransaction({ request, signer })

    const tx = (signer.account.sendTransaction as MockFn).mock.calls[0]?.[0]
    // Exactly the pre-cross-chain shape: a single session on the destination
    // chain. Passing the per-chain set through would name Base Sepolia in the
    // signers of an intent whose route never touches it.
    expect(tx.signers).toEqual({
      type: 'experimental_session',
      session: MOCK_SESSION,
      enableData: MOCK_ENABLE_DATA,
      verifyExecutions: true,
    })
    // And nothing cross-chain leaks into a same-chain request.
    expect(tx.sourceChains).toEqual([sepolia])
    expect(tx.recipient).toBeUndefined()
    expect(tx.sourceCalls).toBeUndefined()
    expect(tx.sourceAssets).toBeUndefined()
    expect(tx.settlementLayers).toBeUndefined()
    expect(tx.gasLimit).toBeUndefined()
  })

  it('drops the stored proof on a same-chain leg with no enable call', async () => {
    const signer = createMockSigner()
    signer.session = crossChainSessionSet()
    // No `sessionEnableData` — the same-chain reveal, whose batch carries no
    // `enableSessionWithRefund`. Collapsing the per-chain set must not carry
    // the stored proof across, or the reveal signs enable-mode and the
    // orchestrator rejects it for a missing enable operation.
    const request = createRhinestoneRequest({
      rhinestoneParams: {
        calls: MOCK_CALLS,
        sponsored: { gas: false, bridging: false, swaps: false },
        feeAsset: 'USDC',
      },
    })

    await submitWarpTransaction({ request, signer })

    const tx = (signer.account.sendTransaction as MockFn).mock.calls[0]![0]
    expect(tx.signers).toEqual({
      type: 'experimental_session',
      session: MOCK_SESSION,
      verifyExecutions: true,
    })
  })

  describe('cross-chain (L2-funded)', () => {
    it('refuses a cross-chain request without the signer funding context', async () => {
      const signer = createMockSigner()
      signer.session = crossChainSessionSet()
      const request = crossChainRequest()

      const result = await submitWarpTransaction({ request, signer })

      // Without the Nexus there is nothing to submit FROM. Submitting from the
      // HCA instead builds an intent with no source element at all, silently
      // dropping `sourceCalls` — fail loudly rather than spend the HCA's own
      // balance on a route the user asked to fund from L2.
      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr().message).toContain(
        'crossChain funding context',
      )
    })

    it('sends from the Nexus with the HCA as recipient, over Across', async () => {
      const signer = createMockSigner()
      signer.session = crossChainSessionSet()
      signer.crossChain = createCrossChainContext()

      await submitWarpTransaction({ request: crossChainRequest(), signer })

      // The intent is submitted by the NEXUS's account, never the HCA's.
      expect(signer.account.sendTransaction).not.toHaveBeenCalled()
      expect(signer.crossChain.account.submitTransaction).toHaveBeenCalledTimes(
        1,
      )

      const tx = (signer.crossChain.account.prepareTransaction as MockFn).mock
        .calls[0]![0]
      expect(tx).toMatchObject({
        sourceChains: [baseSepolia],
        targetChain: sepolia,
        recipient: HCA_CONFIG,
        settlementLayers: ['ACROSS'],
        gasLimit: 1_200_000n,
        signers: {
          type: 'experimental_session',
          sessions: {
            [sepolia.id]: { session: MOCK_SESSION, verifyExecutions: true },
            [baseSepolia.id]: {
              session: MOCK_SESSION,
              verifyExecutions: false,
            },
          },
        },
      })
      // `sourceAssets` is translated from chain ID to a viem Chain for the SDK.
      expect(tx.sourceAssets).toEqual([
        { chain: baseSepolia, address: SOURCE_USDC, amount: SOURCE_CAP },
      ])
    })

    it('settles the wallet pull on the route quote before signing', async () => {
      const signer = createMockSigner()
      signer.session = crossChainSessionSet()
      signer.crossChain = createCrossChainContext()
      // The route claims less than the budget cap, then holds steady.
      const quoted = 4_321_000n
      ;(
        signer.crossChain.account.prepareTransaction as MockFn
      ).mockImplementation(async () => preparedWithClaim(quoted))

      const result = await submitWarpTransaction({
        request: crossChainRequest(),
        signer,
      })

      expect(result.isOk()).toBe(true)
      const prepare = signer.crossChain.account.prepareTransaction as MockFn
      // First attempt at the cap, second at the quote, which then agrees.
      expect(prepare).toHaveBeenCalledTimes(2)
      expect(pullAmountOf(prepare.mock.calls[0]![0])).toBe(SOURCE_CAP)
      expect(pullAmountOf(prepare.mock.calls[1]![0])).toBe(quoted)

      // The permit is left alone — it authorizes BOTH legs, so rewriting it
      // down to one leg's claim would starve the reveal.
      const sourceCalls = prepare.mock.calls[1]![0].sourceCalls[baseSepolia.id]
      expect(
        decodeFunctionData({ abi: fundingAbi, data: sourceCalls[0].data })
          .functionName,
      ).toBe('permit')
    })

    it('drops the destination proof on a leg with no enable call', async () => {
      const signer = createMockSigner()
      signer.session = crossChainSessionSet()
      signer.crossChain = createCrossChainContext()
      // The reveal carries no `sessionEnableData` — the commit already ran the
      // on-chain enable.
      await submitWarpTransaction({ request: crossChainRequest(), signer })

      const tx = (signer.crossChain.account.prepareTransaction as MockFn).mock
        .calls[0]![0]

      // The SDK picks its signature mode purely from `enableData` being truthy.
      // Leaving the stored proof on the destination makes it sign enable-mode
      // for a batch with no `enableSessionWithRefund` call, which the
      // orchestrator rejects: "Standalone HCA session enable operation is
      // missing".
      expect(tx.signers.sessions[sepolia.id].enableData).toBeUndefined()
      // The SOURCE proof stays on every leg — the funding validator's
      // fixed-session signature embeds it each time it claims.
      expect(tx.signers.sessions[baseSepolia.id].enableData).toBe(
        MOCK_SOURCE_ENABLE_DATA,
      )
    })

    it('keeps the destination proof on the leg that enables the session', async () => {
      const signer = createMockSigner()
      signer.session = crossChainSessionSet()
      signer.crossChain = createCrossChainContext()
      const request = crossChainRequest()
      const withEnable = {
        ...request,
        rhinestoneParams: {
          ...request.rhinestoneParams,
          sessionEnableData: MOCK_ENABLE_DATA,
        },
      }

      await submitWarpTransaction({ request: withEnable, signer })

      const tx = (signer.crossChain.account.prepareTransaction as MockFn).mock
        .calls[0]![0]
      expect(tx.signers.sessions[sepolia.id].enableData).toBe(MOCK_ENABLE_DATA)
      expect(tx.signers.sessions[baseSepolia.id].enableData).toBe(
        MOCK_SOURCE_ENABLE_DATA,
      )
    })

    it('raises the destination request to cover the quoted fee', async () => {
      const signer = createMockSigner()
      signer.session = crossChainSessionSet()
      signer.crossChain = createCrossChainContext()
      // The planner refuses the first attempt: the destination fee is bigger
      // than the delivery. This is the real failure this route hit — the leg
      // quotes that size the request are SAME-chain, so they never see a
      // bridged fill's gas.
      const quotedFee = 7_000_000n
      const prepare = signer.crossChain.account.prepareTransaction as MockFn
      let seenFeeError = false
      prepare.mockImplementation(async (tx: never) => {
        if (!seenFeeError) {
          seenFeeError = true
          throw feeExceedsBalanceError(quotedFee)
        }
        return preparedWithClaim(pullAmountOf(tx))
      })

      const result = await submitWarpTransaction({
        request: crossChainRequest(),
        signer,
      })

      expect(result.isOk()).toBe(true)
      // The retry asks for the orchestrator's own number plus a margin,
      // rather than a hardcoded multiplier that drifts with gas prices.
      const retried = prepare.mock.calls.at(-1)![0]
      const delivered = retried.tokenRequests.find(
        (t: { address: Address }) =>
          t.address.toLowerCase() === DEST_USDC.toLowerCase(),
      )
      expect(delivered.amount).toBe(quotedFee + 1_000_000n)
    })

    it('refuses to exceed what the signed permit allows', async () => {
      const signer = createMockSigner()
      signer.session = crossChainSessionSet()
      signer.crossChain = createCrossChainContext()
      ;(
        signer.crossChain.account.prepareTransaction as MockFn
      ).mockImplementation(async () => {
        // A fee beyond the source budget cannot be covered without a new
        // permit — growing the request regardless would pull more than the
        // user authorized.
        throw feeExceedsBalanceError(SOURCE_CAP + 1n)
      })

      const result = await submitWarpTransaction({
        request: crossChainRequest(),
        signer,
      })

      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr().message).toContain(
        'signed funding permit allows',
      )
    })

    it('fails rather than pulling more than the declared budget', async () => {
      const signer = createMockSigner()
      signer.session = crossChainSessionSet()
      signer.crossChain = createCrossChainContext()
      ;(
        signer.crossChain.account.prepareTransaction as MockFn
      ).mockImplementation(async () => preparedWithClaim(SOURCE_CAP + 1n))

      const result = await submitWarpTransaction({
        request: crossChainRequest(),
        signer,
      })

      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr().message).toContain(
        'outside the 9000000 funding budget',
      )
    })
  })
})
