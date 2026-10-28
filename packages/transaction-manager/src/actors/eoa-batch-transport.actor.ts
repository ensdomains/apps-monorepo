import { logger } from '@ens-apps/utils/logger'
import {
  err,
  errAsync,
  fromPromise,
  ok,
  okAsync,
  ResultAsync,
} from 'neverthrow'
import type {
  Address,
  GetCallsStatusReturnType,
  Hash,
  PublicClient,
  WalletClient,
} from 'viem'
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
import { isUpgradeDeclineError } from '../helpers/wallet-errors.helpers'
import {
  hasDeclinedUpgrade,
  recordUpgradeDecline,
} from '../services/upgrade-declines.service'
import type { EOASigner } from '../types/signer.types'
import type {
  EOABatchTransactionRequest,
  TransactionRequest,
} from '../types/transaction.types'
import { resolveEOAWalletChain } from './eoa-transport.actor'

/**
 * Wallets (by EIP-6963 rdns) whose EIP-7702 upgrade installs a delegate that
 * can still own an HCA. `ready` doesn't name the delegate, so we gate on the
 * wallet that picks it. Coinbase's `EIP7702Proxy` waits on its signing format
 * being confirmed. See `docs/research/HCA_7702_WALLETS.md`.
 */
const HCA_SAFE_7702_WALLETS: ReadonlySet<string> = new Set([
  'io.metamask', // EIP7702StatelessDeleGator
  'me.rainbow', // Calibur, Rainbow's deployment
  'org.uniswap.app', // Calibur, Uniswap's deployment
])

/**
 * `supported` always batches. `ready` means our send upgrades the EOA through
 * EIP-7702, so it only counts on a wallet whose delegate keeps the HCA working,
 * and not once the user has declined that upgrade.
 */
export const isAtomicBatchUsable = (params: {
  readonly status: string | undefined
  readonly walletId: string | undefined
  readonly hasDeclinedUpgrade: boolean
}): boolean =>
  params.status === 'supported' ||
  (params.status === 'ready' &&
    !params.hasDeclinedUpgrade &&
    params.walletId !== undefined &&
    HCA_SAFE_7702_WALLETS.has(params.walletId))

/**
 * Whether the connected wallet can execute a `wallet_sendCalls` bundle
 * atomically on `chainId` (EIP-5792 `atomic` capability), per
 * {@link isAtomicBatchUsable}. `walletId` is the wagmi connector id. Any
 * failure means "no", so callers fall back to sequential txs.
 */
export async function getAtomicBatchSupport(params: {
  readonly walletClient: WalletClient
  readonly chainId: number
  readonly walletId?: string
}): Promise<boolean> {
  const { walletClient, chainId, walletId } = params
  try {
    const capabilities = await getCapabilities(walletClient, {
      account: walletClient.account,
      chainId,
    })
    return isAtomicBatchUsable({
      status: capabilities.atomic?.status,
      walletId,
      hasDeclinedUpgrade: hasDeclinedUpgrade(
        walletClient.account?.address,
        chainId,
      ),
    })
  } catch (error) {
    logger.debug('wallet_getCapabilities unavailable', error)
    return false
  }
}

/** Whether `address` has code that isn't an EIP-7702 delegation (a Safe); any failure means "no". */
export async function isContractAccount({
  publicClient,
  address,
}: {
  readonly publicClient: PublicClient
  readonly address: Address
}): Promise<boolean> {
  try {
    const code = await publicClient.getCode({ address })
    return code !== undefined && code !== '0x' && !code.startsWith('0xef0100')
  } catch (error) {
    logger.debug('eth_getCode unavailable', error)
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
  const { walletClient, walletId } = input.signer

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
  // `ready` would turn `forceAtomic` into an EIP-7702 upgrade prompt, which is
  // only acceptable on a wallet whose delegate keeps the HCA working.
  return ResultAsync.fromSafePromise(
    getAtomicBatchSupport({ walletClient, chainId: chain.id, walletId }),
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
          // Declining the 7702 upgrade (5750) declines the bundle: resending
          // would only ask again. Flows plan separate transactions from here.
          if (isUpgradeDeclineError(error)) {
            recordUpgradeDecline(request.from, chain.id)
            return new TransactionUserRejectedError(request, error)
          }
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
