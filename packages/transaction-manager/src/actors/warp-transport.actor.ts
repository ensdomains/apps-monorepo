/**
 * Warp Transport Actor
 *
 * Submits transactions via Rhinestone Warp (intent-based, NOT ERC-4337).
 *
 * Flow: User → Orchestrator → Relayer Market → Intent Router → Account
 *
 * Key differences from the Pimlico (ERC-4337) path:
 * - No bundler/paymaster needed — relayers handle this
 * - Intent-based execution rather than UserOps
 * - Built-in cross-chain support
 * - Uses `waitForExecution` to get the fill receipt
 */

import { errAsync, fromPromise, type ResultAsync } from 'neverthrow'
import type { Hash } from 'viem'
import { sepolia } from 'viem/chains'
import { TransactionSubmissionError } from '../errors/transaction.errors'
import type { RhinestoneSigner } from '../types/signer.types'
import type { TransactionRequest } from '../types/transaction.types'

export interface SubmitWarpTransactionInput {
  readonly request: TransactionRequest
  readonly signer: RhinestoneSigner
}

export function submitWarpTransaction(
  input: SubmitWarpTransactionInput,
): ResultAsync<Hash, TransactionSubmissionError> {
  const { request, signer } = input
  const { account, config } = signer

  if (request.type !== 'rhinestone-intent') {
    return errAsync(
      new TransactionSubmissionError(
        request,
        new Error(
          `Warp transport requires rhinestone-intent request, got: ${request.type}`,
        ),
      ),
    )
  }

  const { calls, sponsored } = request.rhinestoneParams

  if (!calls || calls.length === 0) {
    return errAsync(
      new TransactionSubmissionError(
        request,
        new Error('rhinestoneParams.calls is required and must not be empty'),
      ),
    )
  }

  return fromPromise(
    (async () => {
      const chain = config.chain || sepolia

      // Submit intent via Warp — relayers sponsor gas automatically
      const transaction = await account.sendTransaction({
        chain,
        calls,
        sponsored: sponsored ?? true,
        ...(config.isSessionClient &&
          config.sessionConfig && {
            signers: config.sessionConfig.signers,
          }),
      })

      // Wait for a relayer to fill the intent
      const receipt = await account.waitForExecution(transaction)

      const txHash = receipt.fill.hash

      if (!txHash) {
        throw new Error('No transaction hash returned from Warp execution')
      }

      return txHash
    })(),
    (error) => new TransactionSubmissionError(request, error as Error),
  )
}
