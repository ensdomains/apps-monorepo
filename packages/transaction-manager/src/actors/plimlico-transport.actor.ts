import { errAsync, fromPromise, type ResultAsync } from 'neverthrow'
import type { Hash, PublicClient } from 'viem'
import { TransactionSubmissionError } from '../errors/transaction.errors'
import type { PimlicoSigner } from '../types/signer.types'
import type {
  RhinestoneTransactionRequest,
  TransactionRequest,
} from '../types/transaction.types'
/**
 * Pimlico Transport Actor
 *
 * Submits transactions via permissionless SmartAccountClient (Para + Pimlico).
 * The smart account client is created in useRhinestoneAccount hook.
 * This actor simply forwards calls to the pre-configured client.
 */
export function submitPimlicoTransaction(input: {
  request: TransactionRequest
  signer: PimlicoSigner
  publicClient?: PublicClient // Optional, not used in new architecture
}): ResultAsync<Hash, TransactionSubmissionError> {
  const { request, signer } = input
  const rhinestoneRequest = request as RhinestoneTransactionRequest

  console.log('🔧 [PIMLICO TRANSPORT] Submitting transaction:', {
    hasParams: !!rhinestoneRequest.rhinestoneParams,
    callCount: rhinestoneRequest.rhinestoneParams?.calls?.length,
  })

  if (!rhinestoneRequest.rhinestoneParams) {
    console.error('❌ [PIMLICO TRANSPORT] Missing rhinestoneParams')
    return errAsync(
      new TransactionSubmissionError(
        rhinestoneRequest,
        new Error('rhinestoneParams required for Pimlico transactions'),
      ),
    )
  }

  if (
    !rhinestoneRequest.rhinestoneParams.calls ||
    rhinestoneRequest.rhinestoneParams.calls.length === 0
  ) {
    console.error('❌ [PIMLICO TRANSPORT] Missing or empty calls array')
    return errAsync(
      new TransactionSubmissionError(
        rhinestoneRequest,
        new Error('rhinestoneParams.calls is required and must not be empty'),
      ),
    )
  }

  // The smart account client is already set up in useRhinestoneAccount hook
  // It's configured with Para account as owner and Pimlico for bundling/sponsorship
  const smartAccountClient = signer.account

  if (!smartAccountClient) {
    console.error('❌ [PIMLICO TRANSPORT] Smart account client not found')
    return errAsync(
      new TransactionSubmissionError(
        rhinestoneRequest,
        new Error(
          'Smart account not initialized. Ensure useRhinestoneAccount hook has completed.',
        ),
      ),
    )
  }

  // Check if smartAccountClient has sendTransaction method
  if (typeof smartAccountClient.sendTransaction !== 'function') {
    console.error('❌ [PIMLICO TRANSPORT] Invalid smart account client')
    return errAsync(
      new TransactionSubmissionError(
        rhinestoneRequest,
        new Error('Smart account client does not have sendTransaction method'),
      ),
    )
  }

  return fromPromise(
    (async () => {
      console.log(
        '📤 [PIMLICO TRANSPORT] Sending user operation via smart account client:',
        {
          callCount: rhinestoneRequest.rhinestoneParams.calls.length,
          calls: rhinestoneRequest.rhinestoneParams.calls.map((call) => ({
            to: call.to,
            value: call.value?.toString(),
            dataLength: call.data?.length || 0,
          })),
        },
      )

      // Use sendUserOperation for sponsored transactions with Pimlico
      // This ensures proper paymaster integration
      const userOpHash = await smartAccountClient.sendUserOperation({
        calls: rhinestoneRequest.rhinestoneParams.calls,
      })

      console.log('✅ [PIMLICO TRANSPORT] User operation hash:', userOpHash)

      // Wait for the user operation receipt to get the transaction hash
      const receipt = await smartAccountClient.waitForUserOperationReceipt({
        hash: userOpHash,
      })

      // Extract the transaction hash from the receipt
      const txHash = receipt.receipt.transactionHash

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
      return new TransactionSubmissionError(rhinestoneRequest, error as Error)
    },
  )
}
