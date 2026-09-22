import { YieldableError } from '@ens-apps/utils/neverthrow'
import type { ITaggedError } from '@ens-apps/utils/neverthrow/error-classes'
import type { Address, Hash } from 'viem'
import type { TransactionRequest } from '../types/transaction.types'

// Base error class for transaction errors
export class TransactionError extends YieldableError {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message, { cause })
    this.name = this.constructor.name
  }
}

/**
 * Shape of the orchestrator error fields the Rhinestone SDK surfaces on
 * its thrown `Error`s (`SimulationFailedError`, `OrchestratorError`).
 * All optional — provider-error instances do not extend any public type.
 */
export interface OrchestratorErrorContext {
  readonly name?: string
  readonly errorType?: string
  readonly traceId?: string
  readonly statusCode?: number
  /** Free-form orchestrator detail. Often the most useful field for debugging 400s. */
  readonly context?: unknown
  /** Per-call simulation traces when the orchestrator actually ran sims. */
  readonly simulations?: unknown
}

/**
 * Extract orchestrator-specific fields from an unknown thrown value.
 * Returns an empty object if none of the fields are present, so the
 * result is always safe to spread into logs / error messages.
 */
export function extractOrchestratorErrorContext(
  error: unknown,
): OrchestratorErrorContext {
  if (!error || typeof error !== 'object') return {}
  const e = error as Record<string, unknown>
  const out: Record<string, unknown> = {}
  if (typeof e.name === 'string') out.name = e.name
  if (typeof e.errorType === 'string') out.errorType = e.errorType
  if (typeof e.traceId === 'string') out.traceId = e.traceId
  if (typeof e.statusCode === 'number') out.statusCode = e.statusCode
  if ('context' in e) out.context = e.context
  if ('simulations' in e) out.simulations = e.simulations
  return out as OrchestratorErrorContext
}

/**
 * Serialize an orchestrator error context to a single-line string
 * suitable for embedding in an `Error.message`. Skips empty / undefined
 * fields and pretty-prints the `context` payload (which is where the
 * actual revert / validation reason usually lives).
 */
function formatOrchestratorContext(ctx: OrchestratorErrorContext): string {
  const parts: string[] = []
  if (ctx.errorType) parts.push(`errorType=${ctx.errorType}`)
  if (ctx.statusCode !== undefined) parts.push(`statusCode=${ctx.statusCode}`)
  if (ctx.traceId) parts.push(`traceId=${ctx.traceId}`)
  if (ctx.context !== undefined) {
    let serialized: string
    try {
      serialized = JSON.stringify(ctx.context, (_, v) =>
        typeof v === 'bigint' ? v.toString() : v,
      )
    } catch {
      serialized = String(ctx.context)
    }
    parts.push(`context=${serialized}`)
  }
  if (ctx.simulations !== undefined) {
    let serialized: string
    try {
      serialized = JSON.stringify(ctx.simulations, (_, v) =>
        typeof v === 'bigint' ? v.toString() : v,
      )
    } catch {
      serialized = String(ctx.simulations)
    }
    parts.push(`simulations=${serialized}`)
  }
  return parts.length > 0 ? ` (${parts.join(' ')})` : ''
}

export class TransactionSubmissionError
  extends TransactionError
  implements ITaggedError
{
  readonly _tag = 'TransactionSubmissionError'
  /**
   * Orchestrator-specific fields lifted off the underlying `cause`, so
   * downstream consumers (xstate machine, logger, error UI) can read
   * `error.orchestrator.context` directly without re-parsing the cause.
   */
  public readonly orchestrator: OrchestratorErrorContext
  constructor(
    public readonly request: TransactionRequest,
    cause?: unknown,
  ) {
    const orchestrator = extractOrchestratorErrorContext(cause)
    const baseMessage =
      cause instanceof Error
        ? `Failed to submit transaction: ${cause.message}`
        : 'Failed to submit transaction'
    super(`${baseMessage}${formatOrchestratorContext(orchestrator)}`, cause)
    this.orchestrator = orchestrator
  }
}

export class TransactionUserRejectedError
  extends TransactionError
  implements ITaggedError
{
  readonly _tag = 'TransactionUserRejectedError'
  constructor(
    public readonly request: TransactionRequest,
    cause?: unknown,
  ) {
    super('User rejected transaction', cause)
  }
}

/**
 * Whether `error` is the user declining a wallet request.
 *
 * Narrows viem errors by `name`, as viem documents
 * (https://viem.sh/docs/error-handling), not by `instanceof`. The wallet client
 * is built by the app, and its errors are instances of the viem classes
 * imported here only while the app and this package share one viem copy. pnpm
 * keys viem copies by their resolved peers (see the `zod` catalog entry), so a
 * dependency change can split them again, and nothing fails loudly when that
 * happens. `BaseError.walk` sits behind the same `instanceof`, so the `cause`
 * chain is followed directly; that also reaches through our own wrappers.
 */
export function isUserRejectionError(error: unknown): boolean {
  let current: unknown = error

  while (current instanceof Error) {
    if (current instanceof TransactionUserRejectedError) return true
    if (current.name === 'UserRejectedRequestError') return true
    current = current.cause
  }

  return false
}

export class TransactionTimeoutError
  extends TransactionError
  implements ITaggedError
{
  readonly _tag = 'TransactionTimeoutError'
  constructor(
    public readonly hash: Hash,
    public readonly timeout: number,
  ) {
    super(`Transaction ${hash} timed out after ${timeout}ms`)
  }
}

export class TransactionRevertedError
  extends TransactionError
  implements ITaggedError
{
  readonly _tag = 'TransactionRevertedError'
}

/**
 * The transaction's actor was stopped before it reached success or error, so
 * nothing more will ever be learned about it here.
 *
 * Waiters have to be told: a stopped actor emits no further snapshots, so a
 * caller awaiting one would otherwise hang forever — its mutation stuck
 * pending, its invalidation and history reporting never running — while the
 * transaction itself may well be on-chain.
 */
export class TransactionStoppedError
  extends TransactionError
  implements ITaggedError
{
  readonly _tag = 'TransactionStoppedError'
  constructor(public readonly txId: string) {
    super(
      `Transaction ${txId} stopped before completing. It may still be on-chain.`,
    )
  }
}

export class EthCallFallbackError
  extends TransactionError
  implements ITaggedError
{
  readonly _tag = 'EthCallFallbackError'
  constructor(
    public readonly request: TransactionRequest,
    cause?: unknown,
  ) {
    super('Failed to simulate transaction with eth_call', cause)
  }
}

export class ImportError extends TransactionError implements ITaggedError {
  readonly _tag = 'ImportError'
  constructor({ cause }: { cause?: unknown }) {
    super('Failed to import data', cause)
  }
}

/**
 * Raised when an address we were handed as authoritative does NOT match the
 * address the signer will actually sign from. Covers two invariants that are
 * the same class of bug, both surfaced as this single tagged error:
 *
 *   - EOA: `EOATransactionRequest.from` must equal the connected
 *     `walletClient.account.address`. Otherwise viem would be asked to sign for
 *     a different account than the request claims, corrupting telemetry /
 *     audit attribution (and, in theory, enabling a confused-deputy prompt).
 *   - Smart account (Rhinestone HCA): a cached `signer.config.accountAddress`
 *     must equal the live `signer.account.getAddress()`. A divergence would
 *     encode calldata against one address while the SDK signs from another.
 *
 * Addresses are compared with viem's `isAddressEqual` (checksum-safe), matching
 * the repo-wide convention; never lowercase folding.
 */
export class SignerAddressMismatchError
  extends TransactionError
  implements ITaggedError
{
  readonly _tag = 'SignerAddressMismatchError'
  constructor(
    /** The address that was presented as authoritative (request.from / cached config). */
    public readonly expected: Address,
    /** The address the signer actually signs from (live wallet / SDK), if known. */
    public readonly actual: Address | undefined,
  ) {
    super(
      `Signer address mismatch: presented ${expected} but signer is ${actual ?? 'unknown'}`,
    )
  }
}
