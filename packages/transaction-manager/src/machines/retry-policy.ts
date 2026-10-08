import {
  ChainIdMismatchError,
  SessionRefundCapExceededError,
  SignerAddressMismatchError,
  TransactionSubmissionError,
  TransactionUserRejectedError,
} from '../errors/transaction.errors'
import { isTerminalWalletError } from '../helpers/wallet-errors.helpers'

/**
 * Whether a failed submission is worth sending to the wallet again. Every
 * `false` is a case where the same request fails the same way, so a retry only
 * costs the user another prompt.
 */
export const isRetryableSubmissionError = (error: unknown): boolean => {
  // Covers a typed rejection carrying no cause to walk.
  if (error instanceof TransactionUserRejectedError) return false
  if (isTerminalWalletError(error)) return false

  // The same signer and request fail this check every time.
  if (error instanceof SignerAddressMismatchError) return false

  // The signer captured for this run is pinned to one chain, so every retry
  // re-runs the identical comparison. The user has to switch networks first.
  if (error instanceof ChainIdMismatchError) return false

  // Checked against the session's signed caps before signing. A re-quote moments
  // later lands the same side of them; the fix is a new session, not a retry.
  if (error instanceof SessionRefundCapExceededError) return false

  // The orchestrator says so itself — an `INSUFFICIENT_BALANCE` simulation,
  // say, fails identically on every resubmission.
  if (
    error instanceof TransactionSubmissionError &&
    (error.orchestrator.context as { retryable?: unknown } | undefined)
      ?.retryable === false
  ) {
    return false
  }

  // A desynced nonce re-submits into the same conflict.
  const message = error instanceof Error ? error.message : ''
  return !(
    /nonce too low|nonce.*lower than/i.test(message) ||
    /NonceTooLowError/.test(message)
  )
}
