import type { ResultAsync } from 'neverthrow'
import { type Hash, UserRejectedRequestError } from 'viem'
import {
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
  TransactionSubmissionError | TransactionUserRejectedError
> {
  const { request, signer } = input
  const { walletClient } = signer
  const eoaRequest = request as EOATransactionRequest

  console.log('🔧 [EOA TRANSPORT] Submitting EOA transaction:', {
    from: eoaRequest.from,
    to: eoaRequest.to,
    value: eoaRequest.value?.toString(),
    hasData: !!eoaRequest.data,
  })

  // Build transaction params - either legacy (gasPrice) or EIP-1559 (maxFeePerGas)
  const txParams: any = {
    account: eoaRequest.from,
    to: eoaRequest.to,
    value: eoaRequest.value,
    data: eoaRequest.data,
    gas: eoaRequest.gas,
    nonce: eoaRequest.nonce,
    chain: walletClient.chain,
  }

  // Use either legacy or EIP-1559 gas pricing (not both)
  if (eoaRequest.maxFeePerGas !== undefined) {
    txParams.maxFeePerGas = eoaRequest.maxFeePerGas
    txParams.maxPriorityFeePerGas = eoaRequest.maxPriorityFeePerGas
  } else if (eoaRequest.gasPrice !== undefined) {
    txParams.gasPrice = eoaRequest.gasPrice
  }

  console.log('🔧 [EOA TRANSPORT] Transaction params prepared:', {
    hasMaxFeePerGas: !!txParams.maxFeePerGas,
    hasGasPrice: !!txParams.gasPrice,
    gas: txParams.gas?.toString(),
  })

  return safeSendTransaction(walletClient, txParams).mapErr((error) => {
    if (
      error.name === 'TransactionExecutionError' &&
      error.cause instanceof UserRejectedRequestError
    ) {
      console.error(
        '❌ [EOA TRANSPORT] User rejected transaction:',
        error.cause,
      )
      return new TransactionUserRejectedError(eoaRequest, error.cause)
    }

    console.error('❌ [EOA TRANSPORT] Transaction submission failed:', error)
    return new TransactionSubmissionError(eoaRequest, error)
  })
}
