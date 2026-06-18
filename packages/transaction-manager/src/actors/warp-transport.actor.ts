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
import type { TokenRequest, Transaction } from '@rhinestone/sdk'
import { errAsync, fromPromise, type ResultAsync } from 'neverthrow'
import type { Chain, Hash } from 'viem'
import { baseSepolia, sepolia } from 'viem/chains'
import {
  extractOrchestratorErrorContext,
  TransactionSubmissionError,
} from '../errors/transaction.errors'
import type { RhinestoneSigner } from '../types/signer.types'
import type {
  CrossChainSourceAsset,
  TransactionRequest,
} from '../types/transaction.types'

/**
 * Chains a cross-chain intent may source funds from. Keep in sync with the
 * manager's payment-source registry. The orchestrator validates the actual
 * chain/token support; this map only resolves chainId → viem Chain for the
 * SDK call.
 */
const SOURCE_CHAINS_BY_ID: Record<number, Chain> = {
  [sepolia.id]: sepolia,
  [baseSepolia.id]: baseSepolia,
}

function resolveSourceChains(
  chainIds: number[] | undefined,
  fallback: Chain,
): Chain[] {
  if (!chainIds || chainIds.length === 0) {
    return [fallback]
  }
  return chainIds.map((id) => {
    const chain = SOURCE_CHAINS_BY_ID[id]
    if (!chain) {
      throw new Error(
        `Unsupported source chain id for cross-chain payment: ${id}`,
      )
    }
    return chain
  })
}

function resolveSourceAssets(
  sourceAssets: CrossChainSourceAsset[] | undefined,
): Transaction['sourceAssets'] | undefined {
  if (!sourceAssets || sourceAssets.length === 0) {
    return undefined
  }

  // If an explicit amount is given for any asset, use the SDK's exact-input
  // form (`ExactInputConfig[]`). Otherwise use the chain→token map form so the
  // orchestrator sizes the source input itself from the destination
  // `tokenRequests`.
  //
  // NOTE: the `NO_PLAN_AVAILABLE` in the L2-stables register flow was NOT
  // caused by this encoding. The orchestrator funds an intent from the intent
  // ACCOUNT's balances — the registration flow uses the HCA, which holds no L2
  // balance. `sourceAssets` only selects chain/token, never a different funding
  // owner, so the user's EOA-held L2 stable is invisible to routing. Using the
  // HCA as executor with the EOA as recipient is supported; the missing piece
  // is a separate EOA-funded bridge phase.
  const hasExplicitAmount = sourceAssets.some(
    (asset) => asset.amount !== undefined,
  )

  for (const asset of sourceAssets) {
    if (!SOURCE_CHAINS_BY_ID[asset.chainId]) {
      throw new Error(
        `Unsupported source asset chain id for cross-chain payment: ${asset.chainId}`,
      )
    }
  }

  if (hasExplicitAmount) {
    return sourceAssets.map((asset) => ({
      chain: SOURCE_CHAINS_BY_ID[asset.chainId],
      address: asset.address,
      ...(asset.amount !== undefined ? { amount: asset.amount } : {}),
    })) as Transaction['sourceAssets']
  }

  // Chain → token-list map (`ChainTokenMap`). Tokens identified by address.
  const chainTokens: Record<
    number,
    (typeof sourceAssets)[number]['address'][]
  > = {}
  for (const asset of sourceAssets) {
    if (!asset.address) continue
    const list = chainTokens[asset.chainId] ?? []
    list.push(asset.address)
    chainTokens[asset.chainId] = list
  }
  return chainTokens as unknown as Transaction['sourceAssets']
}

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

  const {
    calls,
    sponsored,
    tokenRequests,
    sourceChains,
    sourceAssets,
    recipient,
  } = request.rhinestoneParams

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
            'Check that the Rhinestone HCA provider is active.',
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

      // HCA accounts are session-less: every Intent is authorized by the
      // account's ENS owner (the connected wallet held inside `account`)
      // and gas-sponsored by Warp relayers. We never pass session
      // `signers` — the SDK uses the account's owner validator.
      //
      // `targetChain` is always the local chain (where the ENS calls execute).
      // `sourceChains` defaults to the same chain (same-chain intent); for
      // cross-chain stable payments the caller supplies the L2 source chain
      // and matching `sourceAssets`, and Warp bridges the funds to the EOA on
      // the target chain before the batched permit+register runs.
      const resolvedSourceChains = resolveSourceChains(sourceChains, chain)
      const resolvedSourceAssets = resolveSourceAssets(sourceAssets)

      // Full, untruncated dump of the cross-chain routing inputs so a failed
      // intent (e.g. NO_PLAN_AVAILABLE) is debuggable from the console.
      logger.debug(
        '🌉 [WARP] cross-chain routing inputs:',
        JSON.stringify(
          {
            targetChainId: chain.id,
            sourceChainIds: resolvedSourceChains.map((c) => c.id),
            sourceChainsRaw: sourceChains,
            sourceAssetsRaw: sourceAssets,
            resolvedSourceAssets,
            tokenRequests,
            recipient,
            accountAddress: account.getAddress?.(),
          },
          (_, v) => (typeof v === 'bigint' ? v.toString() : v),
          2,
        ),
      )

      const sdkParams = {
        sourceChains: resolvedSourceChains,
        targetChain: chain,
        calls,
        sponsored: sponsored ?? true,
        // Pass through caller-provided tokenRequests (for cross-chain txs).
        // Defaults to [] which skips balance validation (needed for local mockestrator).
        // Cast needed: SDK's internal TokenRequests is a strict discriminated union
        // not assignable from TokenRequest[], but semantically equivalent here.
        tokenRequests: (tokenRequests ?? []) as TokenRequest[] &
          Transaction['tokenRequests'],
        ...(resolvedSourceAssets ? { sourceAssets: resolvedSourceAssets } : {}),
        // For cross-chain ENS payments the registrar pulls from the EOA owner,
        // so the bridged funds are delivered to the EOA via `recipient` rather
        // than the default (the account). Same-chain intents omit this.
        ...(recipient ? { recipient } : {}),
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
