import { errAsync, fromPromise, type ResultAsync } from 'neverthrow'
import type { Hash, PublicClient, TransactionReceipt } from 'viem'
import {
  type CallsBundleTimeoutError,
  TransactionRevertedError,
  TransactionTimeoutError,
} from '../errors/transaction.errors'
import { orSafeExecution } from '../helpers/safe-execution.helpers'
import type { Signer } from '../types/signer.types'
import type {
  TransactionOptions,
  TransactionRequest,
} from '../types/transaction.types'
import { waitForEOABatchHash } from './eoa-batch-transport.actor'

/** Observe an accepted transaction without signing or submitting more work. */
export const waitForReceiptActor = (
  {
    hash,
    callsId,
    request,
    signer,
    options,
    publicClient,
  }: {
    readonly hash?: Hash
    readonly callsId?: string
    readonly request?: TransactionRequest
    readonly signer?: Signer
    readonly options?: TransactionOptions
    readonly publicClient: PublicClient
  },
  signal: AbortSignal = new AbortController().signal,
): ResultAsync<
  TransactionReceipt,
  TransactionTimeoutError | CallsBundleTimeoutError | TransactionRevertedError
> => {
  const confirmations = options?.confirmations || 1
  const timeout = options?.timeout || 120000

  const waitForHash = (txHash: Hash) =>
    fromPromise(
      publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations,
        timeout,
      }),
      (_error) => new TransactionTimeoutError(txHash, timeout),
    )

  // A Safe{Wallet} connection answers with the Safe's safeTxHash.
  const connector = signer?.type === 'eoa' ? signer.connector : undefined
  const account = request?.from

  if (hash) {
    return orSafeExecution({
      publicClient,
      connector,
      account,
      id: hash,
      timeout,
      direct: waitForHash(hash),
      settle: waitForHash,
      signal,
    })
  }

  // An EIP-5792 bundle has no hash until the wallet reports it landed.
  if (callsId && signer?.type === 'eoa') {
    return orSafeExecution({
      publicClient,
      connector,
      account,
      id: callsId,
      timeout,
      direct: waitForEOABatchHash({
        walletClient: signer.walletClient,
        id: callsId,
        timeout,
      }).andThen(waitForHash),
      settle: waitForHash,
      signal,
    })
  }

  return errAsync(
    new TransactionRevertedError('No transaction hash to wait for'),
  )
}
