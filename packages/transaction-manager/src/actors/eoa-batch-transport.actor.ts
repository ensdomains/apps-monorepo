import { logger } from '@ens-apps/utils/logger'
import { err, errAsync, fromPromise, ok, type ResultAsync } from 'neverthrow'
import type { Hash, WalletClient } from 'viem'
import { getCapabilities, sendCalls, waitForCallsStatus } from 'viem/actions'
import {
  CallsBundleTimeoutError,
  type ChainIdMismatchError,
  isUserRejectionError,
  type SignerAddressMismatchError,
  TransactionRevertedError,
  TransactionSubmissionError,
  TransactionUserRejectedError,
} from '../errors/transaction.errors'
import type { EOASigner } from '../types/signer.types'
import type {
  EOABatchTransactionRequest,
  TransactionRequest,
} from '../types/transaction.types'
import { resolveEOAWalletChain } from './eoa-transport.actor'

/**
 * Whether the connected wallet can execute a `wallet_sendCalls` bundle
 * atomically on `chainId` (EIP-5792 `atomic` capability). `ready` counts: the
 * wallet offers to upgrade the account (e.g. MetaMask's EIP-7702 prompt) as
 * part of the send. Any failure — no 5792 support at all, a rejected
 * capabilities request — means "no", so callers fall back to sequential txs.
 */
export async function getAtomicBatchSupport(params: {
  readonly walletClient: WalletClient
  readonly chainId: number
}): Promise<boolean> {
  const { walletClient, chainId } = params
  try {
    const capabilities = await getCapabilities(walletClient, {
      account: walletClient.account,
      chainId,
    })
    const status = capabilities.atomic?.status
    return status === 'supported' || status === 'ready'
  } catch (error) {
    logger.debug('wallet_getCapabilities unavailable', error)
    return false
  }
}

/**
 * EOA Batch Transport Actor
 *
 * Sends every call in the request as one atomic EIP-5792 bundle and returns
 * the wallet's bundle id. The transaction hash is only known once the bundle
 * lands — see {@link waitForEOABatchHash}.
 */
export function submitEOABatch(input: {
  request: TransactionRequest
  signer: EOASigner
}): ResultAsync<
  string,
  | TransactionSubmissionError
  | TransactionUserRejectedError
  | SignerAddressMismatchError
  | ChainIdMismatchError
> {
  const request = input.request as EOABatchTransactionRequest
  const { walletClient } = input.signer

  if (request.calls.length === 0) {
    return errAsync(
      new TransactionSubmissionError(
        request,
        new Error('EOA batch has no calls'),
      ),
    )
  }

  const walletChain = resolveEOAWalletChain(request, walletClient)
  if (walletChain.isErr()) return errAsync(walletChain.error)

  return fromPromise(
    sendCalls(walletClient, {
      account: request.from,
      chain: walletChain.value,
      calls: request.calls.map(({ to, data, value }) => ({ to, data, value })),
      // Never let the wallet split the bundle: callers batch calls that are
      // only safe together (approve + spend, grant + revoke).
      forceAtomic: true,
    }),
    (error) => error,
  )
    .map(({ id }) => id)
    .mapErr((error) => {
      if (isUserRejectionError(error)) {
        return new TransactionUserRejectedError(request, error)
      }
      logger.error('EOA batch submission failed', error)
      return new TransactionSubmissionError(request, error)
    })
}

/**
 * Waits for a submitted bundle to land and returns the transaction that
 * carried it. A bundle the wallet reports as failed is a revert even when the
 * carrying transaction succeeded (an ERC-4337 bundle can succeed while the
 * user operation inside it reverts).
 */
export function waitForEOABatchHash(params: {
  readonly walletClient: WalletClient
  readonly id: string
  readonly timeout: number
}): ResultAsync<Hash, CallsBundleTimeoutError | TransactionRevertedError> {
  const { walletClient, id, timeout } = params

  return fromPromise(
    waitForCallsStatus(walletClient, { id, timeout }),
    (cause) => new CallsBundleTimeoutError(id, timeout, cause),
  ).andThen(({ status, receipts }) => {
    const hash = receipts?.at(-1)?.transactionHash
    if (status === 'success' && hash) return ok(hash)
    return err(
      new TransactionRevertedError(
        `Batched calls ${id} failed${hash ? ` (tx ${hash})` : ''}`,
      ),
    )
  })
}
