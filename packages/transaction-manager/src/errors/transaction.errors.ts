import type { ITaggedError } from '@ens-apps/utils/neverthrow/error-classes'
import type { Hash, UserRejectedRequestError } from 'viem'
import type { TransactionRequest } from '../types/transaction.types'

// Base error class for transaction errors
export class TransactionError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = this.constructor.name
  }
}

export class TransactionSubmissionError extends TransactionError {
  constructor(
    public readonly request: TransactionRequest,
    cause?: unknown,
  ) {
    super(
      cause instanceof Error
        ? `Failed to submit transaction: ${cause.message}`
        : 'Failed to submit transaction',
      cause,
    )
  }
}

export class TransactionTimeoutError extends TransactionError {
  constructor(
    public readonly hash: Hash,
    public readonly timeout: number,
  ) {
    super(`Transaction ${hash} timed out after ${timeout}ms`)
  }
}

export class TransactionRevertedError extends TransactionError {}

export class EthCallFallbackError extends TransactionError {
  constructor(
    public readonly request: TransactionRequest,
    cause?: unknown,
  ) {
    super('Failed to simulate transaction with eth_call', cause)
  }
}

export class ImportError extends TransactionError {
  constructor({ cause }: { cause?: unknown }) {
    super('Failed to import data', cause)
  }
}

export class TransactionUserRejectedError
  extends TransactionError
  implements ITaggedError
{
  readonly _tag = 'TransactionUserRejectedError'
  constructor(
    public readonly request: TransactionRequest,
    cause?: UserRejectedRequestError,
  ) {
    super('User rejected transaction', cause)
  }
}
