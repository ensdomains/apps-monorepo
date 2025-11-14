import { errAsync, fromPromise, ok, type ResultAsync } from 'neverthrow'
import type { Hash, Hex, PublicClient } from 'viem'
import { sepolia } from 'viem/chains'
import { TransactionSubmissionError } from '../errors/transaction.errors'
import type { RhinestoneSigner } from '../types/signer.types'
import type {
  RhinestoneTransactionRequest,
  TransactionRequest,
} from '../types/transaction.types'

/**
 * Rhinestone Transport Actor
 *
 * Submits Rhinestone intent transactions via the Rhinestone SDK.
 * This is a pure actor function with no state - all inputs are explicit parameters.
 *
 * The actor accepts generic contract calls and executes them through the
 * Rhinestone smart account, which handles chain abstraction and gas sponsorship.
 */
export function submitRhinestoneTransaction(input: {
  request: TransactionRequest
  signer: RhinestoneSigner
  publicClient: PublicClient
}): ResultAsync<Hash, TransactionSubmissionError> {
  const { request, signer, publicClient } = input
  const { account, config } = signer
  const rhinestoneRequest = request as RhinestoneTransactionRequest

  console.log(
    '🔧 [RHINESTONE TRANSPORT] Submitting Rhinestone intent transaction:',
    {
      accountAddress: account?.getAddress?.(),
      hasParams: !!rhinestoneRequest.rhinestoneParams,
      callCount: rhinestoneRequest.rhinestoneParams?.calls?.length,
    },
  )

  if (!rhinestoneRequest.rhinestoneParams) {
    console.error('❌ [RHINESTONE TRANSPORT] Missing rhinestoneParams')
    return errAsync(
      new TransactionSubmissionError(
        rhinestoneRequest,
        new Error('rhinestoneParams required for Rhinestone transactions'),
      ),
    )
  }

  if (
    !rhinestoneRequest.rhinestoneParams.calls ||
    rhinestoneRequest.rhinestoneParams.calls.length === 0
  ) {
    console.error('❌ [RHINESTONE TRANSPORT] Missing or empty calls array')
    return errAsync(
      new TransactionSubmissionError(
        rhinestoneRequest,
        new Error('rhinestoneParams.calls is required and must not be empty'),
      ),
    )
  }

  console.log('🔧 [RHINESTONE TRANSPORT] Executing with Rhinestone account:', {
    accountAddress: account?.getAddress?.(),
    calls: rhinestoneRequest.rhinestoneParams.calls,
  })

  const chain = config.chain || sepolia

  // Execute the transaction through Rhinestone SDK
  return fromPromise(
    (async () => {
      console.log('📤 Calling rhinestoneAccount.sendUserOperation()...', {
        chain: chain.name,
        chainId: chain.id,
        callCount: rhinestoneRequest.rhinestoneParams.calls.length,
        calls: rhinestoneRequest.rhinestoneParams.calls.map((call) => ({
          to: call.to,
          data: call.data,
          value: call.value.toString(),
        })),
      })

      const transaction = await account.sendUserOperation({
        chain: chain,
        calls: rhinestoneRequest.rhinestoneParams.calls,
      })

      console.log('✅ Transaction response:', transaction)

      // Rhinestone returns an "intent" object with an 'id' property, not 'hash'
      const txHash = transaction.hash || transaction.id

      console.log('✅ Transaction hash/id:', txHash)
      console.log('✅ Transaction type:', transaction.type)

      if (!transaction || (!transaction.hash && !transaction.id)) {
        console.error('❌ No transaction hash or ID returned!', transaction)
        throw new Error(
          'No transaction hash or ID returned from Rhinestone SDK',
        )
      }

      // Convert the bigint ID to a hex string if needed
      const hashAsHex =
        typeof txHash === 'bigint'
          ? (`0x${txHash.toString(16).padStart(64, '0')}` as Hex)
          : (txHash as Hex)

      console.log('✅ Final hash:', hashAsHex)
      return hashAsHex
    })(),
    (error) => {
      console.error(
        '❌ [RHINESTONE TRANSPORT] Transaction submission failed:',
        error,
      )
      console.error('❌ [RHINESTONE TRANSPORT] Error details:', {
        name: error?.name,
        message: error?.message,
        cause: error?.cause,
        stack: error?.stack,
      })
      return new TransactionSubmissionError(rhinestoneRequest, error as Error)
    },
  )
}
