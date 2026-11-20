import {
  CallsBundleTimeoutError,
  TransactionRevertedError,
  TransactionStoppedError,
  TransactionTimeoutError,
} from '@ens-apps/transaction-manager/errors/transaction.errors'

/** The orchestrator accepted the renewal, but the app could not observe its fill. */
class UnobservedRenewalError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause })
  }
}

export const isUnobservedRenewal = (error: unknown): boolean =>
  error instanceof UnobservedRenewalError ||
  error instanceof TransactionTimeoutError ||
  error instanceof CallsBundleTimeoutError ||
  error instanceof TransactionStoppedError

export const classifyRenewalFillError = (
  error: unknown,
  isIntentAccepted: boolean,
): unknown =>
  isIntentAccepted && !(error instanceof TransactionRevertedError)
    ? new UnobservedRenewalError(error)
    : error
