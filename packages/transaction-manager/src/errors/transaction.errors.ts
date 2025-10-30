import type { TransactionRequest } from '../types/transaction.types'

// Base error class for transaction errors
export class TransactionError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = this.constructor.name
  }
}

export class TransactionSubmissionError extends TransactionError {
  constructor(public readonly request: TransactionRequest, cause?: unknown) {
    super('Failed to submit transaction', cause)
  }
}
