import { ResultAsync, errAsync } from 'neverthrow'
import { fromPromise as fromPromiseNT } from 'neverthrow'
import type { Hash, WalletClient } from 'viem'
import type { EOATransactionRequest } from '../types/transaction.types'
import { TransactionSubmissionError } from '../errors/transaction.errors'

/**
 * EOA Transport Actor
 *
 * Submits standard EOA (Externally Owned Account) transactions via WalletClient.
 * This is a pure actor function with no state - all inputs are explicit parameters.
 */
export function submitEOATransaction(input: {
  request: EOATransactionRequest
  walletClient: WalletClient
}): ResultAsync<Hash, TransactionSubmissionError> {
  const { request, walletClient } = input

  console.log('🔧 [EOA TRANSPORT] Submitting EOA transaction:', {
    from: request.from,
    to: request.to,
    value: request.value?.toString(),
    hasData: !!request.data,
  })

  // Build transaction params - either legacy (gasPrice) or EIP-1559 (maxFeePerGas)
  const txParams: any = {
    account: request.from,
    to: request.to,
    value: request.value,
    data: request.data,
    gas: request.gas,
    nonce: request.nonce,
    chain: walletClient.chain,
  }

  // Use either legacy or EIP-1559 gas pricing (not both)
  if (request.maxFeePerGas !== undefined) {
    txParams.maxFeePerGas = request.maxFeePerGas
    txParams.maxPriorityFeePerGas = request.maxPriorityFeePerGas
  } else if (request.gasPrice !== undefined) {
    txParams.gasPrice = request.gasPrice
  }

  console.log('🔧 [EOA TRANSPORT] Transaction params prepared:', {
    hasMaxFeePerGas: !!txParams.maxFeePerGas,
    hasGasPrice: !!txParams.gasPrice,
    gas: txParams.gas?.toString(),
  })

  // Submit transaction and return ResultAsync
  return fromPromiseNT(
    walletClient.sendTransaction(txParams),
    (error) => {
      console.error('❌ [EOA TRANSPORT] Transaction submission failed:', error)
      return new TransactionSubmissionError(request, error)
    }
  )
}
