import { logger } from '@ens-apps/utils/logger'
import {
  err,
  errAsync,
  fromPromise,
  ok,
  okAsync,
  ResultAsync,
} from 'neverthrow'
import type { GetCallsStatusReturnType, Hash, WalletClient } from 'viem'
import { getCapabilities, sendCalls, waitForCallsStatus } from 'viem/actions'
import {
  AtomicBatchUnsupportedError,
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
 * atomically on `chainId` (EIP-5792 `atomic` capability). Only `supported`
 * counts: `ready` means our send would prompt an EIP-7702 upgrade of the EOA,
 * which the app must never trigger. Any failure means "no", so callers fall
 * back to sequential txs.
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
    return capabilities.atomic?.status === 'supported'
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
  readonly request: TransactionRequest
  readonly signer: EOASigner
}): ResultAsync<
  string,
  | TransactionSubmissionError
  | TransactionUserRejectedError
  | SignerAddressMismatchError
  | ChainIdMismatchError
  | AtomicBatchUnsupportedError
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
  const chain = walletChain.value

  // The support the flow was planned on can be stale: a wallet now reporting
  // `ready` would turn `forceAtomic` into an EIP-7702 upgrade prompt.
  return ResultAsync.fromSafePromise(
    getAtomicBatchSupport({ walletClient, chainId: chain.id }),
  )
    .andThen((isSupported) =>
      isSupported
        ? okAsync(undefined)
        : errAsync(new AtomicBatchUnsupportedError(chain.id)),
    )
    .andThen(() =>
      fromPromise(
        sendCalls(walletClient, {
          account: request.from,
          chain,
          calls: request.calls.map(({ to, data, value }) => ({
            to,
            data,
            value,
          })),
          // Never let the wallet split the bundle: callers batch calls that
          // are only safe together (approve + spend, grant + revoke).
          forceAtomic: true,
        }),
        (error) => {
          if (isUserRejectionError(error)) {
            return new TransactionUserRejectedError(request, error)
          }
          logger.error('EOA batch submission failed', error)
          return new TransactionSubmissionError(request, error)
        },
      ),
    )
    .map(({ id }) => id)
}

/**
 * Settled once the wallet reports a failure, or a success it has a receipt
 * for: some wallets (Rainbow) report `success` before returning receipts.
 * Module-level so concurrent waits on one bundle share viem's observer.
 */
const isBundleSettled = ({ statusCode, receipts }: GetCallsStatusReturnType) =>
  statusCode >= 300 ||
  (statusCode === 200 && receipts?.at(-1)?.transactionHash !== undefined)

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
    waitForCallsStatus(walletClient, { id, timeout, status: isBundleSettled }),
    (cause) => new CallsBundleTimeoutError(id, timeout, cause),
  ).andThen(({ status, receipts }) => {
    const hash = receipts?.at(-1)?.transactionHash
    if (status === 'success' && hash) return ok(hash)
    if (status === 'failure') {
      return err(
        new TransactionRevertedError(
          `Batched calls ${id} failed${hash ? ` (tx ${hash})` : ''}`,
        ),
      )
    }
    // An outcome we can't read is not a revert: keep the bundle id so a retry
    // waits on it rather than resending.
    return err(new CallsBundleTimeoutError(id, timeout))
  })
}
