import { errAsync, fromPromise, type ResultAsync } from 'neverthrow'
import type { Hash, PublicClient } from 'viem'
import { TransactionSubmissionError } from '../errors/transaction.errors'
import type { PimlicoSigner } from '../types/signer.types'
import type {
  PimlicoTransactionRequest,
  TransactionRequest,
} from '../types/transaction.types'

/**
 * Pimlico Transport Actor
 *
 * Submits transactions via permissionless SmartAccountClient (Para + Pimlico).
 * The smart account client is created in usePimlicoAccount hook.
 * This actor simply forwards calls to the pre-configured client.
 */
export function submitPimlicoTransaction(input: {
  request: TransactionRequest
  signer: PimlicoSigner
  publicClient?: PublicClient
}): ResultAsync<Hash, TransactionSubmissionError> {
  const { request, signer } = input
  const pimlicoRequest = request as PimlicoTransactionRequest

  console.log('🔧 [PIMLICO TRANSPORT] Submitting transaction:', {
    hasParams: !!pimlicoRequest.pimlicoParams,
    callCount: pimlicoRequest.pimlicoParams?.calls?.length,
  })

  if (!pimlicoRequest.pimlicoParams) {
    console.error('❌ [PIMLICO TRANSPORT] Missing pimlicoParams')
    return errAsync(
      new TransactionSubmissionError(
        pimlicoRequest,
        new Error('pimlicoParams required for Pimlico transactions'),
      ),
    )
  }

  if (
    !pimlicoRequest.pimlicoParams.calls ||
    pimlicoRequest.pimlicoParams.calls.length === 0
  ) {
    console.error('❌ [PIMLICO TRANSPORT] Missing or empty calls array')
    return errAsync(
      new TransactionSubmissionError(
        pimlicoRequest,
        new Error('pimlicoParams.calls is required and must not be empty'),
      ),
    )
  }

  const smartAccountClient = signer.account

  if (!smartAccountClient) {
    console.error('❌ [PIMLICO TRANSPORT] Smart account client not found')
    return errAsync(
      new TransactionSubmissionError(
        pimlicoRequest,
        new Error(
          'Smart account not initialized. Ensure usePimlicoAccount hook has completed.',
        ),
      ),
    )
  }

  if (typeof smartAccountClient.sendUserOperation !== 'function') {
    console.error('❌ [PIMLICO TRANSPORT] Invalid smart account client')
    return errAsync(
      new TransactionSubmissionError(
        pimlicoRequest,
        new Error(
          'Smart account client does not have sendUserOperation method',
        ),
      ),
    )
  }

  return fromPromise(
    (async () => {
      console.log(
        '📤 [PIMLICO TRANSPORT] Sending user operation via smart account client:',
        {
          callCount: pimlicoRequest.pimlicoParams.calls.length,
          calls: pimlicoRequest.pimlicoParams.calls.map((call) => ({
            to: call.to,
            value: call.value?.toString(),
            dataLength: call.data?.length || 0,
          })),
        },
      )

      const userOpHash = await smartAccountClient.sendUserOperation({
        calls: pimlicoRequest.pimlicoParams.calls,
      })

      console.log('✅ [PIMLICO TRANSPORT] User operation hash:', userOpHash)

      const receipt = await smartAccountClient.waitForUserOperationReceipt({
        hash: userOpHash,
      })

      const txHash = receipt.receipt.transactionHash as Hash

      console.log('✅ [PIMLICO TRANSPORT] Transaction submitted:', txHash)
      return txHash as Hash
    })(),
    (error) => {
      console.error('❌ [PIMLICO TRANSPORT] Transaction failed:', error)
      console.error('❌ [PIMLICO TRANSPORT] Error details:', {
        name: (error as Error)?.name,
        message: (error as Error)?.message,
        cause: (error as Error)?.cause,
        stack: (error as Error)?.stack,
      })
      return new TransactionSubmissionError(pimlicoRequest, error as Error)
    },
  )
}
