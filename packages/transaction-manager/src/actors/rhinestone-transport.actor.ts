import { ResultAsync, errAsync } from 'neverthrow'
import type { Hash, PublicClient } from 'viem'
import type { TransactionRequest, RhinestoneTransactionRequest } from '../types/transaction.types'
import type { RhinestoneSigner } from '../types/signer.types'
import { TransactionSubmissionError } from '../errors/transaction.errors'
import { executeENSRenewal } from '../helpers/rhinestone-account.helpers'

/**
 * Rhinestone Transport Actor
 *
 * Submits Rhinestone intent transactions via the Rhinestone SDK.
 * This is a pure actor function with no state - all inputs are explicit parameters.
 */
export function submitRhinestoneTransaction(input: {
  request: TransactionRequest
  signer: RhinestoneSigner
  publicClient: PublicClient
}): ResultAsync<Hash, TransactionSubmissionError> {
  const { request, signer, publicClient } = input
  const { account, config } = signer
  const rhinestoneRequest = request as RhinestoneTransactionRequest

  console.log('🔧 [RHINESTONE TRANSPORT] Submitting Rhinestone intent transaction:', {
    accountAddress: account?.getAddress?.(),
    hasParams: !!rhinestoneRequest.rhinestoneParams,
  })

  if (!rhinestoneRequest.rhinestoneParams) {
    console.error('❌ [RHINESTONE TRANSPORT] Missing rhinestoneParams')
    return errAsync(
      new TransactionSubmissionError(
        rhinestoneRequest,
        new Error('rhinestoneParams required for Rhinestone transactions')
      )
    )
  }

  console.log('🔧 [RHINESTONE TRANSPORT] Executing with Rhinestone account:', {
    accountAddress: account?.getAddress?.(),
    params: rhinestoneRequest.rhinestoneParams,
  })

  // executeENSRenewal returns Promise<Result>, so wrap it with ResultAsync.fromSafePromise
  return ResultAsync.fromSafePromise(
    executeENSRenewal(account, publicClient, rhinestoneRequest.rhinestoneParams, config)
  )
    .andThen(result => result) // Unwrap the Result from the Promise
    .mapErr(error => {
      console.error('❌ [RHINESTONE TRANSPORT] Transaction submission failed:', error)
      return new TransactionSubmissionError(rhinestoneRequest, error as Error)
    })
}
