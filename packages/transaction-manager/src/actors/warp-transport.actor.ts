/**
 * Warp Transport Actor
 *
 * Submits transactions via Rhinestone Warp (intent-based, NOT ERC-4337).
 *
 * Flow: User → Orchestrator → Relayer Market → Intent Router → Account
 *
 * Key characteristics (vs a generic ERC-4337 bundler path):
 * - No bundler/paymaster needed — relayers handle this
 * - Intent-based execution rather than UserOps
 * - Built-in cross-chain support
 * - Uses `waitForExecution` to get the fill receipt
 */

import { logger } from '@ens-apps/utils/logger'
import type { TokenRequest, Transaction } from '@rhinestone/sdk'
import { errAsync, fromPromise, type ResultAsync } from 'neverthrow'
import type { Hash } from 'viem'
import { sepolia } from 'viem/chains'
import {
  extractOrchestratorErrorContext,
  TransactionSubmissionError,
} from '../errors/transaction.errors'
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

  const { calls, sponsored, tokenRequests, useSession } =
    request.rhinestoneParams

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

      // When isSessionClient is false, we're not using sessions —
      // skip session signers (applies to local mockestrator which
      // doesn't support sessions, and to any non-session flow).
      //
      // A caller can also explicitly opt out per-request via
      // `rhinestoneParams.useSession = false` — used for calls whose
      // (target, selector) is not in the active session's action
      // allowlist (e.g. dedicated-resolver record writes from the
      // registration-scoped session). Omitting `signers` makes the SDK
      // fall back to the SCA's default validator, which prompts an EOA
      // owner signature instead of going through SmartSession.
      const sessionAllowedByRequest = useSession !== false
      const sessionSigners =
        config.isSessionClient && sessionAllowedByRequest
          ? config.sessionConfig?.signers
          : undefined
      if (sessionSigners) {
        logger.debug(
          '📤 [WARP] Using experimental_session signers from sessionConfig',
        )
      } else if (config.isSessionClient && !sessionAllowedByRequest) {
        logger.debug(
          '📤 [WARP] Session client present but request opted out of session signers — falling back to SCA default validator',
        )
      }

      const sdkParams = {
        sourceChains: [chain],
        targetChain: chain,
        calls,
        sponsored: sponsored ?? true,
        // Pass through caller-provided tokenRequests (for cross-chain txs).
        // Defaults to [] which skips balance validation (needed for local mockestrator).
        // Cast needed: SDK's internal TokenRequests is a strict discriminated union
        // not assignable from TokenRequest[], but semantically equivalent here.
        tokenRequests: (tokenRequests ?? []) as TokenRequest[] &
          Transaction['tokenRequests'],
        ...(sessionSigners ? { signers: sessionSigners } : {}),
      } satisfies Transaction

      logger.debug(
        '📤 [WARP] SDK sendTransaction params:',
        JSON.stringify(
          Object.fromEntries(
            Object.entries(sdkParams).map(([k, v]) => [
              k,
              Array.isArray(v)
                ? `Array(${(v as unknown[]).length})`
                : typeof v === 'object'
                  ? `${(v as { name?: string })?.name ?? typeof v}`
                  : v,
            ]),
          ),
        ),
      )

      const transaction = await account.sendTransaction(sdkParams)
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
      // Surface full orchestrator error context. The Rhinestone SDK
      // throws `SimulationFailedError` / `OrchestratorError` instances
      // that carry `context`, `errorType`, `traceId`, `statusCode`,
      // `simulations` as enumerable properties — none of which show up
      // in the default `Error.message` and none of which survive a
      // structured-clone round-trip via `postMessage` or react devtools'
      // collapsed-object preview.
      //
      // Three things are done here so the next 400 is debuggable:
      //   1. Pretty-print the orchestrator fields (bigint-safe) to the
      //      logger so they're in the dev console regardless of how the
      //      logger sink formats objects.
      //   2. Pass the original `error` as the cause; the
      //      `TransactionSubmissionError` constructor now lifts the
      //      orchestrator fields onto `error.orchestrator` AND inlines
      //      a one-line summary into `error.message`, so the rich
      //      context propagates through XState's error event without
      //      consumers having to re-parse the cause.
      const orchestrator = extractOrchestratorErrorContext(error)
      const message = error instanceof Error ? error.message : String(error)
      try {
        logger.error(
          '🛑 [WARP] Orchestrator error detail:',
          JSON.stringify(
            { message, ...orchestrator },
            (_, v) => (typeof v === 'bigint' ? v.toString() : v),
            2,
          ),
        )
      } catch {
        logger.error(
          '🛑 [WARP] Orchestrator error (unserializable):',
          message,
          orchestrator,
        )
      }
      return new TransactionSubmissionError(request, error as Error)
    },
  )
}
