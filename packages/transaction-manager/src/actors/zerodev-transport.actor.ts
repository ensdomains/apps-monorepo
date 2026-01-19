import { logger } from '@ens-apps/utils/logger'
import { errAsync, fromPromise, type ResultAsync } from 'neverthrow'
import type { Hash, PublicClient } from 'viem'
import { TransactionSubmissionError } from '../errors/transaction.errors'
import type { ZeroDevSigner } from '../types/signer.types'
import type {
  TransactionRequest,
  ZeroDevTransactionRequest,
} from '../types/transaction.types'

/**
 * ZeroDev Transport Actor
 *
 * Submits transactions via ZeroDev KernelAccountClient.
 * Works with both master account and session-derived clients.
 * The Kernel client is created in SmartAccountContext with zerodev type.
 */
export function submitZeroDevTransaction(input: {
  request: TransactionRequest
  signer: ZeroDevSigner
  publicClient?: PublicClient
}): ResultAsync<Hash, TransactionSubmissionError> {
  const { request, signer } = input
  const zerodevRequest = request as ZeroDevTransactionRequest

  const isSession = signer.config.isSessionClient ?? false

  logger.info('🔧 [ZERODEV TRANSPORT] Submitting transaction:', {
    isSessionClient: isSession,
    hasParams: !!zerodevRequest.zerodevParams,
    callCount: zerodevRequest.zerodevParams?.calls?.length,
  })

  if (!zerodevRequest.zerodevParams) {
    logger.error('❌ [ZERODEV TRANSPORT] Missing zerodevParams')
    return errAsync(
      new TransactionSubmissionError(
        zerodevRequest,
        new Error('zerodevParams required for ZeroDev transactions'),
      ),
    )
  }

  if (
    !zerodevRequest.zerodevParams.calls ||
    zerodevRequest.zerodevParams.calls.length === 0
  ) {
    logger.error('❌ [ZERODEV TRANSPORT] Missing or empty calls array')
    return errAsync(
      new TransactionSubmissionError(
        zerodevRequest,
        new Error('zerodevParams.calls is required and must not be empty'),
      ),
    )
  }

  const kernelClient = signer.account

  if (!kernelClient) {
    logger.error('❌ [ZERODEV TRANSPORT] Kernel account client not found')
    return errAsync(
      new TransactionSubmissionError(
        zerodevRequest,
        new Error(
          'ZeroDev account not initialized. Ensure SmartAccountContext has completed initialization.',
        ),
      ),
    )
  }

  if (typeof kernelClient.sendUserOperation !== 'function') {
    logger.error('❌ [ZERODEV TRANSPORT] Invalid Kernel account client')
    return errAsync(
      new TransactionSubmissionError(
        zerodevRequest,
        new Error(
          'Kernel account client does not have sendUserOperation method',
        ),
      ),
    )
  }

  return fromPromise(
    (async () => {
      logger.info(
        '📤 [ZERODEV TRANSPORT] Sending user operation via Kernel client:',
        {
          isSessionClient: isSession,
          callCount: zerodevRequest.zerodevParams.calls.length,
          calls: zerodevRequest.zerodevParams.calls.map((call) => ({
            to: call.to,
            value: call.value?.toString(),
            dataLength: call.data?.length || 0,
          })),
        },
      )

      const userOpHash = await kernelClient.sendUserOperation({
        calls: zerodevRequest.zerodevParams.calls,
      })

      logger.info('✅ [ZERODEV TRANSPORT] User operation hash:', userOpHash)

      const receipt = await kernelClient.waitForUserOperationReceipt({
        hash: userOpHash,
      })

      const txHash = receipt.receipt.transactionHash as Hash

      logger.info('✅ [ZERODEV TRANSPORT] Transaction submitted:', txHash, {
        isSessionClient: isSession,
      })

      return txHash as Hash
    })(),
    (error) => {
      logger.error('❌ [ZERODEV TRANSPORT] Transaction failed:', error)
      logger.error('❌ [ZERODEV TRANSPORT] Error details:', {
        name: (error as Error)?.name,
        message: (error as Error)?.message,
        cause: (error as Error)?.cause,
        isSessionClient: isSession,
      })
      return new TransactionSubmissionError(zerodevRequest, error as Error)
    },
  )
}
