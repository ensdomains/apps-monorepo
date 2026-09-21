import {
  SignerAddressMismatchError,
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

  // A desynced nonce re-submits into the same conflict.
  const message = error instanceof Error ? error.message : ''
  return !(
    /nonce too low|nonce.*lower than/i.test(message) ||
    /NonceTooLowError/.test(message)
  )
}
