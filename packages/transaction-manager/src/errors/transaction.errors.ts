import type { Hash } from 'viem'
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
    super('Failed to submit transaction', cause)
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
