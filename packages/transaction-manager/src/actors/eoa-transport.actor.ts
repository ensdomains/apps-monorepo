import { logger } from '@ens-apps/utils/logger'
import { err, errAsync, ok, type Result, type ResultAsync } from 'neverthrow'
import { type Chain, type Hash, isAddressEqual, type WalletClient } from 'viem'
import {
  ChainIdMismatchError,
  isUserRejectionError,
  SignerAddressMismatchError,
  TransactionSubmissionError,
  TransactionUserRejectedError,
} from '../errors/transaction.errors'
import { safeSendTransaction } from '../helpers/viem-neverthrow.helpers'
import type { EOASigner } from '../types/signer.types'
import type {
  EOABatchTransactionRequest,
  EOATransactionRequest,
  TransactionRequest,
} from '../types/transaction.types'

/**
 * EOA Transport Actor
 *
 * Submits standard EOA (Externally Owned Account) transactions via WalletClient.
 * This is a pure actor function with no state - all inputs are explicit parameters.
 */
export function submitEOATransaction(input: {
  request: TransactionRequest
  signer: EOASigner
}): ResultAsync<
  Hash,
  | TransactionSubmissionError
  | TransactionUserRejectedError
  | SignerAddressMismatchError
  | ChainIdMismatchError
> {
  const { request, signer } = input
  const eoaRequest = request as EOATransactionRequest

  const walletChain = resolveEOAWalletChain(eoaRequest, signer.walletClient)
  if (walletChain.isErr()) return errAsync(walletChain.error)

  // Build transaction params - either legacy (gasPrice) or EIP-1559 (maxFeePerGas)
  // biome-ignore lint/suspicious/noExplicitAny: txParams is built dynamically with conditional gas fields, not expressible as a single static type
  const txParams: any = {
    account: eoaRequest.from,
    to: eoaRequest.to,
    value: eoaRequest.value,
    data: eoaRequest.data,
    gas: eoaRequest.gas,
    nonce: eoaRequest.nonce,
    chain: walletChain.value,
  }

  // Use either legacy or EIP-1559 gas pricing (not both)
  if (eoaRequest.maxFeePerGas !== undefined) {
    txParams.maxFeePerGas = eoaRequest.maxFeePerGas
    txParams.maxPriorityFeePerGas = eoaRequest.maxPriorityFeePerGas
  } else if (eoaRequest.gasPrice !== undefined) {
    txParams.gasPrice = eoaRequest.gasPrice
  }

  return safeSendTransaction(signer.walletClient, txParams).mapErr((error) => {
    // Matched by name, not `instanceof`: the app builds the wallet client, and
    // its errors are instances of this package's viem classes only while pnpm
    // resolves both to one viem copy. Unrecognised, a declined send is retried
    // as a submission failure, which puts the declined prompt straight back up.
    if (isUserRejectionError(error)) {
      return new TransactionUserRejectedError(eoaRequest, error)
    }

    logger.error('EOA transaction submission failed', error)
    return new TransactionSubmissionError(eoaRequest, error)
  })
}

/**
 * The chain to hand viem for an EOA submission, once the wallet is proven to
 * sign as `request.from` on `request.chainId`. Shared by the single-tx and
 * `wallet_sendCalls` transports so both fail closed the same way.
 */
export function resolveEOAWalletChain(
  request: EOATransactionRequest | EOABatchTransactionRequest,
  walletClient: WalletClient,
): Result<Chain, SignerAddressMismatchError | ChainIdMismatchError> {
  const eoaRequest = request

  // Verify the request's declared `from` matches the account the wallet will
  // actually sign with. Viem signs for whatever `account` we pass, so a
  // divergence would sign with one key while attributing the tx to another —
  // fail closed before the wallet is ever prompted.
  const walletAddress = walletClient.account?.address
  if (!walletAddress || !isAddressEqual(walletAddress, eoaRequest.from)) {
    logger.error('EOA transaction from/account mismatch', {
      from: eoaRequest.from,
      walletAccount: walletAddress,
    })
    return err(new SignerAddressMismatchError(eoaRequest.from, walletAddress))
  }

  // Verify the wallet is on the chain this request was prepared for.
  //
  // `chain` is the only lever we have over viem's own guard: `sendTransaction`
  // runs a live `eth_chainId` and calls `assertCurrentChain` — but ONLY when
  // `chain !== null`. The previous `?? null` therefore turned the one case that
  // matters into a silent skip: wagmi resolves `walletClient.chain` by looking
  // the connection's live chainId up in `config.chains`, so a wallet switched
  // to a chain the app does not declare (portal declares Sepolia alone, with
  // `syncConnectedChain: false`) yields `undefined` — and the transaction was
  // then broadcast, and paid for, on that chain.
  //
  // Passing a real `Chain` keeps that guard switched on. The two checks cover
  // different things and both are needed: we prove `walletClient.chain` is the
  // request's chain here, and viem then re-checks that same chain against a
  // live `eth_chainId` at send time — catching a provider that moves in
  // between.
  const walletChain = walletClient.chain
  if (!walletChain || walletChain.id !== eoaRequest.chainId) {
    logger.error('EOA transaction chain mismatch', {
      requestChainId: eoaRequest.chainId,
      walletChainId: walletChain?.id,
    })
    return err(new ChainIdMismatchError(eoaRequest.chainId, walletChain))
  }

  return ok(walletChain)
}
