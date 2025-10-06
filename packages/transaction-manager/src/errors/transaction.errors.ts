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

export class TransactionTimeoutError extends TransactionError {
  constructor(public readonly hash: string, public readonly timeout: number) {
    super(`Transaction timed out after ${timeout}ms`)
  }
}

export class TransactionRevertedError extends TransactionError {
  constructor(public readonly hash: string, public readonly reason?: string) {
    super(`Transaction reverted: ${reason || 'unknown reason'}`)
  }
}

export class GasEstimationError extends TransactionError {
  constructor(public readonly request: TransactionRequest, cause?: unknown) {
    super('Failed to estimate gas', cause)
  }
}

export class EthCallFallbackError extends TransactionError {
  constructor(public readonly request: TransactionRequest, cause?: unknown) {
    super('eth_call fallback failed', cause)
  }
}

export class UserOperationError extends TransactionError {
  constructor(public readonly userOp: Record<string, unknown>, cause?: unknown) {
    super('User operation failed', cause)
  }
}

export class PersistenceError extends TransactionError {
  constructor(public readonly operation: 'read' | 'write' | 'delete', cause?: unknown) {
    super(`Persistence ${operation} failed`, cause)
  }
}

export class ImportError extends TransactionError {
  constructor(cause?: unknown) {
    super('Failed to import data', cause)
  }
}