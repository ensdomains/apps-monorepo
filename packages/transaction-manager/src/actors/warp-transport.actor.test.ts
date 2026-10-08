/**
 * Warp Transport Actor Tests
 *
 * Tests for submitWarpTransaction — the Warp intent-based transport.
 */

import {
  buildHcaSessionConfig,
  getDestinationContracts,
  sizeRefundCaps,
} from '@ens-apps/smart-account'
import type { RhinestoneAccount } from '@rhinestone/sdk'
import type { Address, Hash, Hex } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ChainIdMismatchError,
  SessionRefundCapExceededError,
  TransactionSubmissionError,
} from '../errors/transaction.errors'
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
      prepareTransaction: vi.fn().mockResolvedValue('mock-prepared'),
      signTransaction: vi.fn().mockResolvedValue('mock-signed'),
      submitTransaction: vi.fn().mockResolvedValue('mock-intent-id'),
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

  it('returns ChainIdMismatchError when the signer chain is not the request chain', async () => {
    const signer = createMockSigner()
    signer.config.chain = mainnet

    const result = await submitWarpTransaction({
      request: createRhinestoneRequest(),
      signer,
    })

    expect(result.isErr()).toBe(true)
    const error = result._unsafeUnwrapErr()
    expect(error).toBeInstanceOf(ChainIdMismatchError)
    expect((error as ChainIdMismatchError).expected).toBe(sepolia.id)
    expect((error as ChainIdMismatchError).actual).toBe(mainnet.id)
    expect(signer.account.prepareTransaction).not.toHaveBeenCalled()
  })

  it('returns ChainIdMismatchError instead of defaulting when the signer has no chain', async () => {
    // Previously `config.chain || sepolia` silently routed the intent to
    // Sepolia regardless of what the request asked for.
    const signer = createMockSigner()
    signer.config.chain = undefined

    const result = await submitWarpTransaction({
      request: createRhinestoneRequest(),
      signer,
    })

    expect(result.isErr()).toBe(true)
    const error = result._unsafeUnwrapErr()
    expect(error).toBeInstanceOf(ChainIdMismatchError)
    expect((error as ChainIdMismatchError).actual).toBeUndefined()
    expect(signer.account.prepareTransaction).not.toHaveBeenCalled()
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

    expect(signer.account.prepareTransaction).toHaveBeenCalledWith({
      sourceChains: [sepolia],
      targetChain: sepolia,
      calls: MOCK_CALLS,
      sponsored: { gas: false, bridging: false, swaps: false },
      feeAsset: 'USDC',
      tokenRequests: [],
    })
    // No active session → `signers` must not be passed.
    expect(signer.account.prepareTransaction).not.toHaveBeenCalledWith(
      expect.objectContaining({ signers: expect.anything() }),
    )
  })

  it('session attached: signs with the scoped session and its own enableData', async () => {
    const signer = createMockSigner()
    const enableData = { mode: 'session' } as never
    signer.session = { session: MOCK_SESSION, enableData }
    const request = createRhinestoneRequest()

    await submitWarpTransaction({ request, signer })

    expect(signer.account.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        signers: {
          type: 'experimental_session',
          session: MOCK_SESSION,
          enableData,
          verifyExecutions: true,
        },
      }),
    )
  })

  // The standalone validator only accepts session signatures that carry the
  // owner's authorization; without it the fill reverts InvalidSessionData().
  it('refuses a session-signed intent with no enableData anywhere', async () => {
    const signer = createMockSigner()
    signer.session = { session: MOCK_SESSION }
    const request = createRhinestoneRequest()

    const result = await submitWarpTransaction({ request, signer })

    expect(result._unsafeUnwrapErr()).toBeInstanceOf(TransactionSubmissionError)
    expect(result._unsafeUnwrapErr().message).toContain(
      'needs the session enable data',
    )
    expect(signer.account.prepareTransaction).not.toHaveBeenCalled()
  })

  it("prefers the request's enableData over the session's", async () => {
    const signer = createMockSigner()
    signer.session = {
      session: MOCK_SESSION,
      enableData: { mode: 'session' } as never,
    }
    const sessionEnableData = { mode: 'enable' } as never
    const request = createRhinestoneRequest({
      rhinestoneParams: {
        calls: MOCK_CALLS,
        feeAsset: 'USDC',
        sessionEnableData,
      },
    })

    await submitWarpTransaction({ request, signer })

    expect(signer.account.prepareTransaction).toHaveBeenCalledWith(
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
    expect(signer.account.prepareTransaction).not.toHaveBeenCalled()
  })

  it('routes through prepare, sign, submit', async () => {
    const signer = createMockSigner()
    const request = createRhinestoneRequest()

    await submitWarpTransaction({ request, signer })

    expect(signer.account.signTransaction).toHaveBeenCalledWith('mock-prepared')
    expect(signer.account.submitTransaction).toHaveBeenCalledWith('mock-signed')
  })

  it('forwards auxiliaryFunds to prepareTransaction (sendTransaction drops them)', async () => {
    const signer = createMockSigner()
    const usdc = '0x768F42455A2D082E23ceeF7d51e5787C82d67a39' as Address
    const auxiliaryFunds = { 11155111: { [usdc]: 21_468_136n } }
    const request = createRhinestoneRequest({
      rhinestoneParams: { calls: MOCK_CALLS, auxiliaryFunds },
    })

    await submitWarpTransaction({ request, signer })

    expect(signer.account.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ auxiliaryFunds }),
    )
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

    expect(signer.account.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        sponsored: { gas: false, bridging: false, swaps: false },
        feeAsset: 'USDC',
      }),
    )
  })

  it('returns TransactionSubmissionError on SDK failure', async () => {
    const signer = createMockSigner()
    ;(
      signer.account.prepareTransaction as ReturnType<typeof vi.fn>
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
})

describe('submitWarpTransaction — session refund caps', () => {
  const USDC = getDestinationContracts(sepolia.id).usdc

  /** A session's proof, carrying the caps it was authorized with. */
  const enableDataWithCaps = (quotedOverhead?: bigint) =>
    ({
      userSignature: '0x',
      hashesAndChainIds: [],
      sessionToEnableIndex: 0,
      hcaSessionNonce: 0n,
      hcaSessionConfig: buildHcaSessionConfig({
        chainId: sepolia.id,
        sessionKey: '0x5555555555555555555555555555555555555555',
        validUntil: 1_800_000_000n,
        resolver: '0x3333333333333333333333333333333333333333',
        refundCaps: sizeRefundCaps(quotedOverhead),
      }),
    }) as never

  /** A prepared intent quoting `gasOverhead` and `refundAmount`. */
  const preparedQuoting = (gasOverhead: bigint, refundAmount = 20_660n) => ({
    intentRoute: {
      intentOp: {
        elements: [
          {
            mandate: {
              qualifier: {
                settlementContext: {
                  gasRefund: {
                    token: USDC,
                    exchangeRate: '2568073614',
                    overhead: ((refundAmount << 128n) | gasOverhead).toString(),
                  },
                },
              },
            },
          },
        ],
      },
    },
  })

  function sessionSignerPreparing(prepared: unknown, quotedOverhead?: bigint) {
    const signer = createMockSigner()
    signer.session = {
      session: MOCK_SESSION,
      enableData: enableDataWithCaps(quotedOverhead),
    }
    ;(
      signer.account.prepareTransaction as ReturnType<typeof vi.fn>
    ).mockResolvedValue(prepared)
    return signer
  }

  it('refuses to sign a quote whose overhead outgrew the session, as fixable', async () => {
    // Legacy session (500k cap) against the 2.97M overhead Sepolia quoted.
    const signer = sessionSignerPreparing(preparedQuoting(2_972_344n))

    const result = await submitWarpTransaction({
      request: createRhinestoneRequest(),
      signer,
    })

    const error = result._unsafeUnwrapErr()
    expect(error).toBeInstanceOf(SessionRefundCapExceededError)
    const capError = error as SessionRefundCapExceededError
    expect(capError.isFixableByNewSession).toBe(true)
    expect(capError.requiredGasOverhead).toBe(2_972_344n)
    expect(signer.account.signTransaction).not.toHaveBeenCalled()
    expect(signer.account.submitTransaction).not.toHaveBeenCalled()
  })

  it('signs a quote within the caps the session was sized with', async () => {
    const signer = sessionSignerPreparing(
      preparedQuoting(2_972_344n),
      2_972_344n,
    )

    const result = await submitWarpTransaction({
      request: createRhinestoneRequest(),
      signer,
    })

    expect(result.isOk()).toBe(true)
    expect(signer.account.signTransaction).toHaveBeenCalled()
  })

  it('reports a refund amount over its fixed cap as not fixable', async () => {
    const signer = sessionSignerPreparing(
      preparedQuoting(100_000n, 200_000_000n),
    )

    const result = await submitWarpTransaction({
      request: createRhinestoneRequest(),
      signer,
    })

    const error = result._unsafeUnwrapErr() as SessionRefundCapExceededError
    expect(error).toBeInstanceOf(SessionRefundCapExceededError)
    expect(error.isFixableByNewSession).toBe(false)
    expect(error.message).toContain('fee ceiling (200 USDC)')
    expect(signer.account.signTransaction).not.toHaveBeenCalled()
  })

  it('does not check owner-signed intents, which carry no session caps', async () => {
    const signer = createMockSigner()
    ;(
      signer.account.prepareTransaction as ReturnType<typeof vi.fn>
    ).mockResolvedValue(preparedQuoting(2_972_344n))

    const result = await submitWarpTransaction({
      request: createRhinestoneRequest(),
      signer,
    })

    expect(result.isOk()).toBe(true)
  })
})
