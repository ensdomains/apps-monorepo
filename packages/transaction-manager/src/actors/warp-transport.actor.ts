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

import { logger } from '@ens-apps/utils/logger'
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

  // Runtime guard: ensure we have a RhinestoneAccount, not a permissionless SmartAccountClient.
  // The waitForExecution method only exists on RhinestoneAccount.
  if (typeof account.waitForExecution !== 'function') {
    return errAsync(
      new TransactionSubmissionError(
        request,
        new Error(
          'Warp transport requires a RhinestoneAccount but received a different client type. ' +
            'Check that the Rhinestone provider is active (VITE_FF_RHINESTONE_SESSIONS=true)',
        ),
      ),
    )
  }

  const nowMs = (): number =>
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()

  const overallStart = nowMs()

  return fromPromise(
    (async () => {
      const chain = config.chain || sepolia

      const sendStart = nowMs()

      // Log raw call data before SDK processes it
      logger.debug(
        '📤 [WARP] Raw calls before SDK:',
        JSON.stringify(
          calls,
          (_, v) => (typeof v === 'bigint' ? v.toString() : v),
          2,
        ),
      )
      logger.debug('📤 [WARP] Account address:', account.getAddress?.())
      logger.debug('📤 [WARP] Chain:', chain.name, chain.id)
      logger.debug('📤 [WARP] Sponsored:', sponsored ?? true)

      const sessionSigners = config.sessionConfig?.signers
      if (sessionSigners) {
        logger.debug(
          '📤 [WARP] Using experimental_session signers from sessionConfig',
        )
      }

      const transaction = await account.sendTransaction({
        sourceChains: [chain],
        targetChain: chain,
        calls,
        sponsored: sponsored ?? true,
        ...(sessionSigners ? { signers: sessionSigners } : {}),
      })
      const sendLatencyMs = nowMs() - sendStart

      logger.debug(
        '📤 [WARP] sendTransaction latency (ms):',
        sendLatencyMs.toFixed(1),
      )

      // Wait for a relayer to fill the intent
      const waitStart = nowMs()
      const receipt = await account.waitForExecution(transaction, false)
      const waitLatencyMs = nowMs() - waitStart
      const totalLatencyMs = nowMs() - overallStart

      logger.debug(
        '📥 [WARP] waitForExecution latency (ms):',
        waitLatencyMs.toFixed(1),
      )
      logger.debug(
        '✅ [WARP] Total submission latency (ms):',
        totalLatencyMs.toFixed(1),
      )

      const txHash = receipt.fill.hash

      if (!txHash) {
        throw new Error('No transaction hash returned from Warp execution')
      }

      return txHash
    })(),
    (error: unknown) => {
      // Surface full orchestrator error context (errorType, traceId, simulations)
      // SDK throws SimulationFailedError / OrchestratorError with rich fields the
      // default Error.message hides. Logging here so the next 400 is debuggable.
      try {
        const e = error as {
          message?: string
          context?: unknown
          errorType?: string
          traceId?: string
          statusCode?: number
          simulations?: unknown
          name?: string
        }
        logger.error('🛑 [WARP] Orchestrator error detail:', {
          name: e.name,
          message: e.message,
          errorType: e.errorType,
          traceId: e.traceId,
          statusCode: e.statusCode,
          context: e.context,
          simulations: e.simulations,
        })
      } catch {
        logger.error('🛑 [WARP] Orchestrator error (unserializable):', error)
      }
      return new TransactionSubmissionError(request, error as Error)
    },
  )
}
