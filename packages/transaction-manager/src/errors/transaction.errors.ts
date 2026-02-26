import { YieldableError } from '@ens-apps/utils/neverthrow'
import type { ITaggedError } from '@ens-apps/utils/neverthrow/error-classes'
import type { Hash, UserRejectedRequestError } from 'viem'
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

export class TransactionSubmissionError
  extends TransactionError
  implements ITaggedError
{
  readonly _tag = 'TransactionSubmissionError'
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
