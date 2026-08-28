import { logger } from '@ens-apps/utils/logger'
import { errAsync, type ResultAsync } from 'neverthrow'
import { type Hash, isAddressEqual } from 'viem'
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
  const { walletClient } = signer
  const eoaRequest = request as EOATransactionRequest

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
    return errAsync(
      new SignerAddressMismatchError(eoaRequest.from, walletAddress),
    )
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
  // Pinning the request's own chain closes both halves: we reject here when the
  // wallet declares nothing or declares the wrong chain, and viem rejects at
  // send time if the provider has moved since.
  const walletChain = walletClient.chain
  if (!walletChain || walletChain.id !== eoaRequest.chainId) {
    logger.error('EOA transaction chain mismatch', {
      requestChainId: eoaRequest.chainId,
      walletChainId: walletChain?.id,
    })
    return errAsync(
      new ChainIdMismatchError(eoaRequest.chainId, walletChain?.id),
    )
  }

  // Build transaction params - either legacy (gasPrice) or EIP-1559 (maxFeePerGas)
  // biome-ignore lint/suspicious/noExplicitAny: txParams is built dynamically with conditional gas fields, not expressible as a single static type
  const txParams: any = {
    account: eoaRequest.from,
    to: eoaRequest.to,
    value: eoaRequest.value,
    data: eoaRequest.data,
    gas: eoaRequest.gas,
    nonce: eoaRequest.nonce,
    chain: walletChain,
  }

  // Use either legacy or EIP-1559 gas pricing (not both)
  if (eoaRequest.maxFeePerGas !== undefined) {
    txParams.maxFeePerGas = eoaRequest.maxFeePerGas
    txParams.maxPriorityFeePerGas = eoaRequest.maxPriorityFeePerGas
  } else if (eoaRequest.gasPrice !== undefined) {
    txParams.gasPrice = eoaRequest.gasPrice
  }

  return safeSendTransaction(walletClient, txParams).mapErr((error) => {
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
