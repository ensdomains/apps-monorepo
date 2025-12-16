import { errAsync, fromPromise, type ResultAsync } from 'neverthrow'
import type { Hash, PublicClient } from 'viem'
import { TransactionSubmissionError } from '../errors/transaction.errors'
import type { KernelSigner } from '../types/signer.types'
import type {
  KernelTransactionRequest,
  TransactionRequest,
} from '../types/transaction.types'

/**
 * Kernel Transport Actor
 *
 * Submits transactions via ZeroDev KernelAccountClient.
 * Works with both master account and session-derived clients.
 * The Kernel client is created in useSmartAccount hook with kernel type.
 */
export function submitKernelTransaction(input: {
  request: TransactionRequest
  signer: KernelSigner
  publicClient?: PublicClient
}): ResultAsync<Hash, TransactionSubmissionError> {
  const { request, signer } = input
  const kernelRequest = request as KernelTransactionRequest

  const isSession = signer.config.isSessionClient ?? false

  console.log('🔧 [KERNEL TRANSPORT] Submitting transaction:', {
    isSessionClient: isSession,
    hasParams: !!kernelRequest.kernelParams,
    callCount: kernelRequest.kernelParams?.calls?.length,
  })

  if (!kernelRequest.kernelParams) {
    console.error('❌ [KERNEL TRANSPORT] Missing kernelParams')
    return errAsync(
      new TransactionSubmissionError(
        kernelRequest,
        new Error('kernelParams required for Kernel transactions'),
      ),
    )
  }

  if (
    !kernelRequest.kernelParams.calls ||
    kernelRequest.kernelParams.calls.length === 0
  ) {
    console.error('❌ [KERNEL TRANSPORT] Missing or empty calls array')
    return errAsync(
      new TransactionSubmissionError(
        kernelRequest,
        new Error('kernelParams.calls is required and must not be empty'),
      ),
    )
  }

  const kernelClient = signer.account

  if (!kernelClient) {
    console.error('❌ [KERNEL TRANSPORT] Kernel account client not found')
    return errAsync(
      new TransactionSubmissionError(
        kernelRequest,
        new Error(
          'Kernel account not initialized. Ensure useSmartAccount hook with kernel type has completed.',
        ),
      ),
    )
  }

  if (typeof kernelClient.sendUserOperation !== 'function') {
    console.error('❌ [KERNEL TRANSPORT] Invalid Kernel account client')
    return errAsync(
      new TransactionSubmissionError(
        kernelRequest,
        new Error(
          'Kernel account client does not have sendUserOperation method',
        ),
      ),
    )
  }

  return fromPromise(
    (async () => {
      console.log(
        '📤 [KERNEL TRANSPORT] Sending user operation via Kernel client:',
        {
          isSessionClient: isSession,
          callCount: kernelRequest.kernelParams.calls.length,
          calls: kernelRequest.kernelParams.calls.map((call) => ({
            to: call.to,
            value: call.value?.toString(),
            dataLength: call.data?.length || 0,
          })),
        },
      )

      const userOpHash = await kernelClient.sendUserOperation({
        calls: kernelRequest.kernelParams.calls,
      })

      console.log('✅ [KERNEL TRANSPORT] User operation hash:', userOpHash)

      const receipt = await kernelClient.waitForUserOperationReceipt({
        hash: userOpHash,
      })

      const txHash = receipt.receipt.transactionHash as Hash

      console.log('✅ [KERNEL TRANSPORT] Transaction submitted:', txHash, {
        isSessionClient: isSession,
      })

      return txHash as Hash
    })(),
    (error) => {
      console.error('❌ [KERNEL TRANSPORT] Transaction failed:', error)
      console.error('❌ [KERNEL TRANSPORT] Error details:', {
        name: (error as Error)?.name,
        message: (error as Error)?.message,
        cause: (error as Error)?.cause,
        isSessionClient: isSession,
      })
      return new TransactionSubmissionError(kernelRequest, error as Error)
    },
  )
}
