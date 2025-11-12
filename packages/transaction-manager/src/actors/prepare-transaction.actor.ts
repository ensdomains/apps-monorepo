import { errAsync, ResultAsync } from 'neverthrow'
import type { Hex, PublicClient } from 'viem'
import { prepareENSRenewalTransaction } from '../helpers/rhinestone-account.helpers'
import type {
  TransactionIntent,
  TransactionRequest,
} from '../types/transaction.types'

export class TransactionPreparationError extends Error {
  constructor(
    public intent: TransactionIntent,
    message: string,
    public cause?: Error,
  ) {
    super(message)
    this.name = 'TransactionPreparationError'
  }
}

export interface PreparedTransactionData {
  request: TransactionRequest
  estimatedCost: bigint
}

/**
 * Prepare Transaction Actor
 *
 * Routes to the appropriate preparation logic based on intent type.
 * Returns an unsigned transaction request ready for submission.
 */
export function prepareTransaction(input: {
  intent: TransactionIntent
  publicClient: PublicClient
  chainId: number
  useSmartAccount: boolean
}): ResultAsync<PreparedTransactionData, TransactionPreparationError> {
  const { intent, publicClient, chainId, useSmartAccount } = input

  console.log('🔧 [PREPARE] Preparing transaction:', {
    intentType: intent.type,
    useSmartAccount,
    chainId,
  })

  // Route based on intent type
  switch (intent.type) {
    case 'ens-renewal':
      return prepareENSRenewal(intent, publicClient, chainId, useSmartAccount)

    case 'eth-transfer':
      return prepareETHTransfer(intent, publicClient, chainId, useSmartAccount)

    case 'custom':
      // Custom intent already has a prepared request
      return ResultAsync.fromSafePromise(
        Promise.resolve({
          request: intent.request,
          estimatedCost: intent.request.value || 0n,
        }),
      )

    default:
      return errAsync(
        new TransactionPreparationError(
          intent,
          `Unknown intent type: ${(intent as any).type}`,
        ),
      )
  }
}

/**
 * Prepare ENS Renewal Transaction
 */
function prepareENSRenewal(
  intent: Extract<TransactionIntent, { type: 'ens-renewal' }>,
  publicClient: PublicClient,
  chainId: number,
  useSmartAccount: boolean,
): ResultAsync<PreparedTransactionData, TransactionPreparationError> {
  return ResultAsync.fromPromise(
    (async () => {
      const { name, duration, from } = intent

      console.log('📋 [PREPARE] Preparing ENS renewal:', {
        name,
        duration: duration.toString(),
      })

      // Use the existing helper to prepare the transaction
      const txResult = await prepareENSRenewalTransaction(publicClient, {
        name,
        duration,
      })

      if (txResult.isErr()) {
        throw txResult.error
      }

      const { to, data, value } = txResult.value

      // Create the appropriate request type based on account type
      const request: TransactionRequest = useSmartAccount
        ? {
            type: 'rhinestone-intent',
            from,
            to,
            data,
            value,
            chainId,
            rhinestoneParams: {
              calls: [
                {
                  to,
                  data,
                  value,
                },
              ],
            },
          }
        : {
            type: 'eoa',
            from,
            to,
            data,
            value,
            chainId,
          }

      console.log('✅ [PREPARE] Transaction prepared:', {
        type: request.type,
        to,
        value: value.toString(),
      })

      return {
        request,
        estimatedCost: value, // For ENS renewal, the cost is just the renewal price (gas will be added during execution)
      }
    })(),
    (error) =>
      new TransactionPreparationError(
        intent,
        `Failed to prepare ENS renewal: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      ),
  )
}

/**
 * Prepare ETH Transfer Transaction
 */
function prepareETHTransfer(
  intent: Extract<TransactionIntent, { type: 'eth-transfer' }>,
  _publicClient: PublicClient,
  chainId: number,
  useSmartAccount: boolean,
): ResultAsync<PreparedTransactionData, TransactionPreparationError> {
  return ResultAsync.fromPromise(
    (async () => {
      const { to, value, from, data } = intent

      console.log('📋 [PREPARE] Preparing ETH transfer:', {
        to,
        value: value.toString(),
        from,
      })

      // Create the appropriate request type based on account type
      const request: TransactionRequest = useSmartAccount
        ? {
            type: 'rhinestone-intent',
            from,
            to,
            data: data || ('0x' as Hex),
            value,
            chainId,
            rhinestoneParams: {
              calls: [
                {
                  to,
                  data: data || ('0x' as Hex),
                  value,
                },
              ],
            },
          }
        : {
            type: 'eoa',
            from,
            to,
            data: data || ('0x' as Hex),
            value,
            chainId,
          }

      console.log('✅ [PREPARE] ETH transfer prepared')

      return {
        request,
        estimatedCost: value,
      }
    })(),
    (error) =>
      new TransactionPreparationError(
        intent,
        `Failed to prepare ETH transfer: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      ),
  )
}
