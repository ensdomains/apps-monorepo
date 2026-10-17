import {
  L2BridgeExpiredError,
  L2BridgeRejectedError,
  L2BridgeSubmitError,
  L2BridgeUnavailableError,
} from '@ens-apps/smart-account'
import {
  ChainIdMismatchError,
  SessionRefundCapExceededError,
  SignerAddressMismatchError,
  TransactionSubmissionError,
  TransactionUserRejectedError,
} from '../errors/transaction.errors'
import { isTerminalWalletError } from '../helpers/wallet-errors.helpers'

/**
 * An L2-paid intent stopped before it left the app: no route, a route the
 * app refused, a quote that expired while signing, or a failed submit.
 */
const isUnsentL2Payment = (error: unknown): boolean => {
  let current: unknown = error
  for (let depth = 0; current instanceof Error && depth < 10; depth++) {
    if (
      current instanceof L2BridgeUnavailableError ||
      current instanceof L2BridgeRejectedError ||
      current instanceof L2BridgeExpiredError ||
      current instanceof L2BridgeSubmitError
    ) {
      return true
    }
    current = current.cause
  }
  return false
}

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

  // Nothing went out, and resending would put another wallet prompt up.
  if (isUnsentL2Payment(error)) return false

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
