import { ResultAsync, errAsync } from 'neverthrow'
import type { Hash, PublicClient } from 'viem'
import type { RhinestoneTransactionRequest, RhinestoneConfig } from '../types/transaction.types'
import { TransactionSubmissionError } from '../errors/transaction.errors'
import { executeENSRenewal } from '../helpers/rhinestone-account.helpers'

/**
 * Rhinestone Transport Actor
 *
 * Submits Rhinestone intent transactions via the Rhinestone SDK.
 * This is a pure actor function with no state - all inputs are explicit parameters.
 */
export function submitRhinestoneTransaction(input: {
  request: RhinestoneTransactionRequest
  rhinestoneAccount: any
  publicClient: PublicClient
  rhinestoneConfig: RhinestoneConfig
}): ResultAsync<Hash, TransactionSubmissionError> {
  const { request, rhinestoneAccount, publicClient, rhinestoneConfig } = input

  console.log('🔧 [RHINESTONE TRANSPORT] Submitting Rhinestone intent transaction:', {
    accountAddress: rhinestoneAccount?.getAddress?.(),
    hasParams: !!request.rhinestoneParams,
  })

  if (!request.rhinestoneParams) {
    console.error('❌ [RHINESTONE TRANSPORT] Missing rhinestoneParams')
    return errAsync(
      new TransactionSubmissionError(
        request,
        new Error('rhinestoneParams required for Rhinestone transactions')
      )
    )
  }

  console.log('🔧 [RHINESTONE TRANSPORT] Executing with Rhinestone account:', {
    accountAddress: rhinestoneAccount?.getAddress?.(),
    targetChain: request.rhinestoneParams.chain?.id,
  })

  // executeENSRenewal returns Promise<Result>, so wrap it with ResultAsync.fromSafePromise
  return ResultAsync.fromSafePromise(
    executeENSRenewal(rhinestoneAccount, publicClient, request.rhinestoneParams, rhinestoneConfig)
  )
    .andThen(result => result) // Unwrap the Result from the Promise
    .mapErr(error => {
      console.error('❌ [RHINESTONE TRANSPORT] Transaction submission failed:', error)
      return new TransactionSubmissionError(request, error as Error)
    })
}
