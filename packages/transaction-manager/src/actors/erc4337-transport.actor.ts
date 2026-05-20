import { logger } from '@ens-apps/utils/logger'
import { errAsync, fromPromise, type ResultAsync } from 'neverthrow'
import { type Hash, type PublicClient, UserRejectedRequestError } from 'viem'
import {
  TransactionSubmissionError,
  TransactionUserRejectedError,
} from '../errors/transaction.errors'
import type { Erc4337Signer } from '../types/signer.types'
import type {
  Erc4337TransactionRequest,
  TransactionRequest,
} from '../types/transaction.types'

/**
 * ERC-4337 Transport Actor
 *
 * Submits transactions via a permissionless `SmartAccountClient`
 * (Pimlico-bundled). The client is created in SmartAccountContext with
 * the `erc4337` signer type.
 */
export function submitErc4337Transaction(input: {
  request: TransactionRequest
  signer: Erc4337Signer
  publicClient?: PublicClient
}): ResultAsync<
  Hash,
  TransactionSubmissionError | TransactionUserRejectedError
> {
  const { request, signer } = input
  const erc4337Request = request as Erc4337TransactionRequest

  logger.info('🔧 [ERC4337 TRANSPORT] Submitting transaction:', {
    hasParams: !!erc4337Request.erc4337Params,
    callCount: erc4337Request.erc4337Params?.calls?.length,
  })

  if (!erc4337Request.erc4337Params) {
    logger.error('❌ [ERC4337 TRANSPORT] Missing erc4337Params')
    return errAsync(
      new TransactionSubmissionError(
        erc4337Request,
        new Error('erc4337Params required for ERC-4337 transactions'),
      ),
    )
  }

  if (
    !erc4337Request.erc4337Params.calls ||
    erc4337Request.erc4337Params.calls.length === 0
  ) {
    logger.error('❌ [ERC4337 TRANSPORT] Missing or empty calls array')
    return errAsync(
      new TransactionSubmissionError(
        erc4337Request,
        new Error('erc4337Params.calls is required and must not be empty'),
      ),
    )
  }

  const smartAccountClient = signer.account

  if (!smartAccountClient) {
    logger.error('❌ [ERC4337 TRANSPORT] Smart account client not found')
    return errAsync(
      new TransactionSubmissionError(
        erc4337Request,
        new Error(
          'ERC-4337 account not initialized. Ensure SmartAccountContext has completed initialization.',
        ),
      ),
    )
  }

  if (typeof smartAccountClient.sendUserOperation !== 'function') {
    logger.error('❌ [ERC4337 TRANSPORT] Invalid smart account client')
    return errAsync(
      new TransactionSubmissionError(
        erc4337Request,
        new Error(
          'Smart account client does not have sendUserOperation method',
        ),
      ),
    )
  }

  return fromPromise(
    (async () => {
      logger.info(
        '📤 [ERC4337 TRANSPORT] Sending user operation via smart account client:',
        {
          callCount: erc4337Request.erc4337Params.calls.length,
          calls: erc4337Request.erc4337Params.calls.map((call) => ({
            to: call.to,
            value: call.value?.toString(),
            dataLength: call.data?.length || 0,
          })),
        },
      )

      const userOpHash = await smartAccountClient.sendUserOperation({
        calls: erc4337Request.erc4337Params.calls,
      })

      logger.info('✅ [ERC4337 TRANSPORT] User operation hash:', userOpHash)

      const receipt = await smartAccountClient.waitForUserOperationReceipt({
        hash: userOpHash,
      })

      const txHash = receipt.receipt.transactionHash as Hash

      logger.info('✅ [ERC4337 TRANSPORT] Transaction submitted:', txHash)

      return txHash as Hash
    })(),
    (error) => {
      if (error instanceof UserRejectedRequestError) {
        logger.error('❌ [ERC4337 TRANSPORT] User rejected transaction:', error)
        return new TransactionUserRejectedError(erc4337Request, error)
      }

      logger.error('❌ [ERC4337 TRANSPORT] Transaction failed:', error)
      logger.error('❌ [ERC4337 TRANSPORT] Error details:', {
        name: (error as Error)?.name,
        message: (error as Error)?.message,
        cause: (error as Error)?.cause,
      })
      return new TransactionSubmissionError(erc4337Request, error as Error)
    },
  )
}
