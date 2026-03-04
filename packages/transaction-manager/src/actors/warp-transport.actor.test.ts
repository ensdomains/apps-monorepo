/**
 * Warp Transport Actor Tests
 *
 * Tests for submitWarpTransaction — the Warp intent-based transport.
 */

import type { RhinestoneAccount, SignerSet } from '@rhinestone/sdk'
import type { Address, Hash, Hex } from 'viem'
import { sepolia } from 'viem/chains'
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

function createMockSigner(
  overrides: {
    isSessionClient?: boolean
    sessionConfig?: { signers: SignerSet }
  } = {},
): RhinestoneSigner {
  return {
    type: 'rhinestone',
    account: {
      sendTransaction: vi.fn().mockResolvedValue('mock-intent-id'),
      waitForExecution: vi.fn().mockResolvedValue({
        fill: { hash: MOCK_TX_HASH },
      }),
    } as unknown as RhinestoneAccount,
    config: {
      rhinestoneApiKey: 'test-key',
      chain: sepolia,
      isSessionClient: overrides.isSessionClient ?? false,
      sessionConfig: overrides.sessionConfig,
    },
  }
}

function createRhinestoneRequest(
  overrides: Partial<RhinestoneTransactionRequest> = {},
): RhinestoneTransactionRequest {
  return {
    type: 'rhinestone-intent',
    from: '0xFrom1234567890123456789012345678901234' as Address,
    to: '0xTo12345678901234567890123456789012345678' as Address,
    chainId: 11155111,
    rhinestoneParams: {
      calls: MOCK_CALLS,
      sponsored: true,
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

  it('returns error for empty calls array', async () => {
    const signer = createMockSigner()
    const request = createRhinestoneRequest({
      rhinestoneParams: { calls: [], sponsored: true },
    })

    const result = await submitWarpTransaction({ request, signer })

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(TransactionSubmissionError)
    expect(result._unsafeUnwrapErr().message).toContain(
      'calls is required and must not be empty',
    )
  })

  it('calls sendTransaction with chain, calls, and sponsored=true', async () => {
    const signer = createMockSigner()
    const request = createRhinestoneRequest()

    await submitWarpTransaction({ request, signer })

    expect(signer.account.sendTransaction).toHaveBeenCalledWith({
      chain: sepolia,
      calls: MOCK_CALLS,
      sponsored: true,
    })
  })

  it('calls waitForExecution and returns receipt.fill.hash', async () => {
    const signer = createMockSigner()
    const request = createRhinestoneRequest()

    const result = await submitWarpTransaction({ request, signer })

    expect(signer.account.waitForExecution).toHaveBeenCalledWith(
      'mock-intent-id',
    )
    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toBe(MOCK_TX_HASH)
  })

  it('spreads signers when isSessionClient and sessionConfig present', async () => {
    const mockSigners = { mock: 'signer-set' } as unknown as SignerSet
    const signer = createMockSigner({
      isSessionClient: true,
      sessionConfig: { signers: mockSigners },
    })
    const request = createRhinestoneRequest()

    await submitWarpTransaction({ request, signer })

    expect(signer.account.sendTransaction).toHaveBeenCalledWith({
      chain: sepolia,
      calls: MOCK_CALLS,
      sponsored: true,
      signers: mockSigners,
    })
  })

  it('does not spread signers when isSessionClient is false', async () => {
    const signer = createMockSigner({ isSessionClient: false })
    const request = createRhinestoneRequest()

    await submitWarpTransaction({ request, signer })

    expect(signer.account.sendTransaction).toHaveBeenCalledWith({
      chain: sepolia,
      calls: MOCK_CALLS,
      sponsored: true,
    })
  })

  it('defaults sponsored to true when not specified', async () => {
    const signer = createMockSigner()
    const request = createRhinestoneRequest({
      rhinestoneParams: { calls: MOCK_CALLS },
    })

    await submitWarpTransaction({ request, signer })

    expect(signer.account.sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ sponsored: true }),
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
})
