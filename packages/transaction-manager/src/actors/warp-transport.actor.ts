/**
 * Warp Transport Actor
 *
 * Submits transactions via Rhinestone Warp (intent-based, NOT ERC-4337).
 *
 * Flow: User → Orchestrator → Relayer Market → Intent Router → Account
 *
 * Unlike an ERC-4337 bundler path:
 * - No bundler/paymaster needed — relayers handle this
 * - Intent-based execution rather than UserOps
 * - Built-in cross-chain support
 * - Uses `waitForExecution` to get the fill receipt
 */

import { logger } from '@ens-apps/utils/logger'
import type {
  PreparedTransactionData,
  Session,
  TokenRequest,
  Transaction,
} from '@rhinestone/sdk'
import { errAsync, fromPromise, type ResultAsync } from 'neverthrow'
import type { Address, Chain, Hash } from 'viem'
import { decodeFunctionData, encodeFunctionData, erc20Abi } from 'viem'
import { baseSepolia, sepolia } from 'viem/chains'
import {
  extractOrchestratorErrorContext,
  TransactionSubmissionError,
} from '../errors/transaction.errors'
import type { RhinestoneSigner } from '../types/signer.types'
import type {
  Call,
  RhinestoneIntentParams,
  TransactionRequest,
} from '../types/transaction.types'

/**
 * The ONLY sponsorship value this codebase ever sends.
 *
 * Gas sponsorship does not exist on the standalone-HCA deployment: intents are
 * user-paid in USDC out of the HCA's own balance, funded by an EIP-2612 permit
 * carried inside the batch. There is deliberately no caller-facing knob and no
 * env flag — this used to default to `true` when `sponsored` was omitted, so
 * every new call site silently asked for a subsidy no relayer here offers.
 */
const UNSPONSORED = { gas: false, bridging: false, swaps: false } as const

/** Fee asset the HCA pays from when a request does not name one. */
const DEFAULT_FEE_ASSET = 'USDC' as const

export interface SubmitWarpTransactionInput {
  readonly request: TransactionRequest
  readonly signer: RhinestoneSigner
}

/** Supported funding source chains, keyed by ID for `sourceChains`. */
const SOURCE_CHAINS: Record<number, Chain> = {
  [baseSepolia.id]: baseSepolia,
}

function sourceChainForId(chainId: number): Chain {
  const chain = SOURCE_CHAINS[chainId]
  if (!chain) {
    throw new Error(
      `Chain ${chainId} is not an enabled cross-chain funding source`,
    )
  }
  return chain
}

/** Low 160 bits of a Permit2 `idsAndAmounts` id are the token address. */
const TOKEN_ID_MASK = (1n << 160n) - 1n

/**
 * USDC (6dp) requested above the orchestrator's quoted fee when retrying.
 *
 * Funding the fill to the exact cent leaves nothing for the batch's own
 * execution and no slack if the quote moves between prepare and fill.
 */
const FEE_MARGIN_USDC = 1_000_000n

/**
 * Sum the source-token amounts the prepared route will actually claim.
 *
 * This is the number the wallet→Nexus `transferFrom` has to match:
 * `HCAFundingSessionValidator` reverts unless the summed pull equals the
 * Permit2 claim (`_validateFundingOperation(...) != claimSourceAmount`), so
 * pulling the whole budget cap is not merely wasteful — it fails on-chain.
 */
function quotedSourcePull(
  prepared: PreparedTransactionData,
  sourceToken: Address,
): bigint {
  const wanted = sourceToken.toLowerCase()
  return prepared.intentRoute.intentOp.elements.reduce(
    (routeTotal, element) =>
      routeTotal +
      element.idsAndAmounts.reduce((total, [id, amount]) => {
        const token = `0x${(BigInt(id) & TOKEN_ID_MASK).toString(16).padStart(40, '0')}`
        return token === wanted ? total + BigInt(amount) : total
      }, 0n),
    0n,
  )
}

/**
 * Copy the per-chain source calls into the fresh mutable arrays the SDK's
 * `sourceCalls` expects, rewriting the single wallet→Nexus `transferFrom` to
 * `pullAmount`.
 *
 * Mirrors the reference `liveHcaRhinestoneRegistration` route's `callsForPull`.
 * Throws when the pull is missing or duplicated: the validator counts on
 * exactly one, and a silently-unmodified batch would pull the wrong amount.
 */
function sourceCallsForPull(
  sourceCalls: NonNullable<RhinestoneIntentParams['sourceCalls']>,
  params: { sourceChainId: number; sourceToken: Address; nexus: Address },
  pullAmount: bigint,
): Transaction['sourceCalls'] {
  let pullCount = 0
  const rewrite = (call: Call): Call => {
    if (call.to.toLowerCase() !== params.sourceToken.toLowerCase()) return call
    let decoded: ReturnType<typeof decodeFunctionData<typeof erc20Abi>>
    try {
      decoded = decodeFunctionData({ abi: erc20Abi, data: call.data })
    } catch {
      // Not an ERC-20 call at all (the EIP-2612 permit) — leave it alone.
      return call
    }
    // `erc20Abi` decodes every ERC-20 entry point, so the selector has to be
    // checked explicitly: an `approve(PERMIT2, …)` op is legal in this batch
    // and its args are shaped differently.
    if (decoded.functionName !== 'transferFrom') return call
    const [from, to] = decoded.args
    if (to.toLowerCase() !== params.nexus.toLowerCase()) return call
    pullCount += 1
    return {
      ...call,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transferFrom',
        args: [from, to, pullAmount],
      }),
    }
  }

  const result = Object.fromEntries(
    Object.entries(sourceCalls).map(([chainId, chainCalls]) => [
      Number(chainId),
      Number(chainId) === params.sourceChainId
        ? chainCalls.map(rewrite)
        : [...chainCalls],
    ]),
  ) as Transaction['sourceCalls']

  if (pullCount !== 1) {
    throw new Error(
      `Expected exactly one wallet-to-Nexus pull in the source calls, found ${pullCount}`,
    )
  }
  return result
}

/**
 * Settle the wallet→Nexus pull on the orchestrator's own quote.
 *
 * Prepare with the budget cap, read what the route says it will claim, rewrite
 * the pull to that, and re-prepare until the two agree (changing the pull
 * changes the route, which can change the quote again). The reference route
 * does the same; 12 attempts is its bound too.
 */
async function prepareWithSettledPull(
  sender: RhinestoneSigner['account'],
  build: (pullAmount: bigint) => Transaction,
  budgetCap: bigint,
  sourceToken: Address,
): Promise<PreparedTransactionData> {
  const maxAttempts = 12
  const seen: bigint[] = []
  let pull = budgetCap
  let prepared = await sender.prepareTransaction(build(pull))

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const quoted = quotedSourcePull(prepared, sourceToken)
    seen.push(quoted)
    if (quoted === pull) return prepared
    if (quoted === 0n || quoted > budgetCap) {
      throw new Error(
        `Quoted source cost ${quoted} is outside the ${budgetCap} funding budget`,
      )
    }
    pull = quoted
    prepared = await sender.prepareTransaction(build(pull))
  }

  throw new Error(
    `Source cost did not settle after ${maxAttempts} re-quotes: ${seen.join(', ')}`,
  )
}

/**
 * The gas cost an orchestrator `FEE_EXCEEDS_BALANCE` rejection reports, or
 * `undefined` for any other failure.
 *
 * The planner refuses a route whose destination fee exceeds what the intent
 * delivers, and says exactly what the fee was. The leg quotes that size our
 * request are SAME-chain, so they cannot see a bridged fill's gas — rather than
 * guessing a multiplier that drifts with gas prices, take the number the
 * orchestrator just gave us and ask for that much.
 */
function feeShortfall(error: unknown): bigint | undefined {
  const context = extractOrchestratorErrorContext(error)?.context as
    | { code?: string; gasCostEstimate?: string | number }
    | undefined
  if (context?.code !== 'FEE_EXCEEDS_BALANCE') return undefined
  const estimate = context.gasCostEstimate
  if (estimate === undefined) return undefined
  try {
    return BigInt(estimate)
  } catch {
    return undefined
  }
}

/**
 * Settle BOTH the destination request and the source pull.
 *
 * Outer loop grows the destination request to cover the orchestrator's quoted
 * fee; inner loop settles the wallet pull against the resulting route. The
 * request can only grow as far as the signed permit allows — beyond that the
 * user would have to sign a new one, so fail with a message that says so
 * instead of silently pulling more than they authorized.
 */
async function prepareCrossChain(
  sender: RhinestoneSigner['account'],
  build: (pullAmount: bigint, destinationAmount: bigint) => Transaction,
  params: {
    budgetCap: bigint
    sourceToken: Address
    destinationFloor: bigint
    /** Margin over the quoted fee, so the fill is not funded to the cent. */
    feeMargin: bigint
  },
): Promise<PreparedTransactionData> {
  const maxFeeAttempts = 3
  let destination = params.destinationFloor

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prepareWithSettledPull(
        sender,
        (pull) => build(pull, destination),
        params.budgetCap,
        params.sourceToken,
      )
    } catch (error) {
      const quotedFee = feeShortfall(error)
      if (quotedFee === undefined || attempt >= maxFeeAttempts - 1) throw error

      const needed = quotedFee + params.feeMargin
      if (needed <= destination) throw error
      if (needed > params.budgetCap) {
        throw new Error(
          `The orchestrator quotes ${quotedFee} USDC (6dp) of destination gas, ` +
            `which needs a ${needed} delivery — beyond the ${params.budgetCap} ` +
            'the signed funding permit allows. Re-authorize the funding permit ' +
            'for a larger amount, or wait for gas to fall.',
          { cause: error },
        )
      }
      logger.debug(
        `📤 [WARP] Fee exceeds delivery; raising destination request ${destination} → ${needed}`,
      )
      destination = needed
    }
  }
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
    feeAsset,
    sessionEnableData,
    tokenRequests,
    auxiliaryFunds,
    sourceChainId,
    sourceCalls,
    sourceAssets,
    gasLimit,
  } = request.rhinestoneParams

  // A cross-chain request needs the signer's funding context: the Nexus that
  // sends the intent and the HCA config it delivers to. Without it there is
  // nothing to route from, so fail here rather than silently submitting a
  // same-chain intent that spends the HCA's own balance.
  const crossChain = sourceChainId !== undefined ? signer.crossChain : undefined
  if (sourceChainId !== undefined && !crossChain) {
    return errAsync(
      new TransactionSubmissionError(
        request,
        new Error(
          `rhinestoneParams.sourceChainId=${sourceChainId} requires a signer with ` +
            'crossChain funding context (the source Nexus + HCA recipient). ' +
            'Cross-chain intents are submitted from the Nexus, not the HCA.',
        ),
      ),
    )
  }
  if (crossChain && crossChain.chainId !== sourceChainId) {
    return errAsync(
      new TransactionSubmissionError(
        request,
        new Error(
          `Source chain mismatch: request funds from ${sourceChainId} but the ` +
            `signer's Nexus is on ${crossChain.chainId}.`,
        ),
      ),
    )
  }
  // The pull is settled against the route's quote before signing, and the cap
  // comes from `sourceAssets`. Without it there is nothing to re-quote against
  // and the pull would be whatever the caller happened to encode — which the
  // funding validator rejects unless it matches the claim to the wei.
  const sourceBudgetCap = sourceAssets?.find(
    (asset) => asset.chainId === sourceChainId,
  )?.amount
  // What the caller asked to have delivered — a FLOOR, raised by the adaptive
  // retry when the orchestrator quotes a bigger fee than the leg estimate saw.
  const destinationFloor =
    (crossChain
      ? tokenRequests?.find(
          (t) =>
            t.address.toLowerCase() ===
            crossChain.destinationToken.toLowerCase(),
        )?.amount
      : undefined) ?? 0n
  if (crossChain && sourceCalls && sourceBudgetCap === undefined) {
    return errAsync(
      new TransactionSubmissionError(
        request,
        new Error(
          `Cross-chain funding needs a sourceAssets entry for chain ${sourceChainId} ` +
            'to bound (and re-quote) the wallet-to-Nexus pull.',
        ),
      ),
    )
  }

  if (sessionEnableData && !signer.session) {
    return errAsync(
      new TransactionSubmissionError(
        request,
        new Error(
          'rhinestoneParams.sessionEnableData requires a signer with an active session',
        ),
      ),
    )
  }

  if (!calls || calls.length === 0) {
    return errAsync(
      new TransactionSubmissionError(
        request,
        new Error('rhinestoneParams.calls is required and must not be empty'),
      ),
    )
  }

  // The account that SENDS this intent: the source Nexus for cross-chain
  // (with the HCA as `recipient`), the HCA itself otherwise.
  const sender = crossChain?.account ?? account

  // Runtime guard: ensure we have a RhinestoneAccount.
  // The waitForExecution method only exists on RhinestoneAccount.
  if (typeof sender.waitForExecution !== 'function') {
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

  // Authorization: if the signer carries an active scoped session, the SDK
  // signs this Intent with the ephemeral SESSION KEY (no wallet prompt) via
  // `experimental_session`. `enableData` is attached ONLY on the request that
  // also carries the on-chain `enableSessionWithRefund` call (the first HCA
  // action); afterwards it is omitted per the standalone-HCA spec. Without a
  // session we omit `signers` and the SDK uses the connected owner
  // (owner-signed).
  //
  // Cross-chain: the signer carries a `PerChainSessionSignerSet` (one session
  // per chain). The SDK matches each session to its chain, but the DESTINATION
  // entry's `enableData` must still track this request:
  //
  //   - the SOURCE entry keeps its proof on every leg — the funding validator's
  //     fixed-session signature embeds it each time it claims;
  //   - the DESTINATION entry carries a proof only on the leg that also carries
  //     the on-chain `enableSessionWithRefund` call.
  //
  // The SDK picks its signature mode purely from `enableData` being truthy, so
  // a stored proof left on the reveal makes it sign enable-mode for a batch
  // with no enable call — which the orchestrator rejects outright with
  // "Standalone HCA session enable operation is missing". `buildSessionContext`
  // bakes the proof in unconditionally (it cannot know the leg), so gate it
  // here on the per-request payload, which only the commit sets. Mirrors the
  // reference route, where the reveal's destination entry has no `enableData`.
  //
  // The branch is on THIS REQUEST'S route, not on the signer's shape. The
  // session authorization is multi-chain for everyone (it is signed before the
  // user picks a payment route), so a same-chain registration also carries a
  // per-chain set. Keying off the signer would then hand a Sepolia→Sepolia
  // intent a signer set naming a source chain that is not in its route.
  // Collapsing to the destination entry keeps the same-chain request byte-for-
  // byte what it was before cross-chain funding existed.
  const sessionSigners = (():
    | NonNullable<Transaction['signers']>
    | undefined => {
    if (!signer.session) return undefined

    const perChain =
      'sessions' in signer.session ? signer.session.sessions : undefined
    const destinationChainId = config.chain?.id ?? sepolia.id

    if (sourceChainId !== undefined) {
      if (!perChain)
        return signer.session as NonNullable<Transaction['signers']>
      return {
        ...signer.session,
        sessions: Object.fromEntries(
          Object.entries(perChain).map(([id, entry]) => {
            // Source chain: keep the proof exactly as stored.
            if (Number(id) !== destinationChainId) return [Number(id), entry]
            const { enableData: _stored, ...withoutProof } = entry
            return [
              Number(id),
              sessionEnableData
                ? { ...withoutProof, enableData: sessionEnableData }
                : withoutProof,
            ]
          }),
        ),
      } as NonNullable<Transaction['signers']>
    }

    // Same-chain: one session on the destination chain, with the per-request
    // enable-data attached.
    const entry = perChain?.[destinationChainId]
    const session = perChain
      ? entry?.session
      : (signer.session as { session: Session }).session
    if (!session) {
      throw new Error(
        `The active session has no entry for the destination chain ${destinationChainId}.`,
      )
    }
    return {
      type: 'experimental_session' as const,
      session,
      // ONLY the per-request payload. Never fall back to the proof stored in
      // the signer set: that proof is baked in unconditionally and outlives the
      // leg that carries the enable call, so falling back would sign the reveal
      // in enable-mode for a batch with no enable operation.
      ...(sessionEnableData ? { enableData: sessionEnableData } : {}),
      verifyExecutions: true,
    } satisfies NonNullable<Transaction['signers']>
  })()

  // Funds arriving DURING this intent (the HCA's `permit` + `transferFrom`
  // pair). The planner only credits balances it can already see, so without
  // this it refuses to quote whenever the account's standing balance is below
  // the fee.
  const declaredFunds = auxiliaryFunds as Transaction['auxiliaryFunds']

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

      // Cross-chain shape, mirroring the reference
      // `liveHcaRhinestoneRegistration` route:
      //
      //   - sent FROM the Nexus, delivering TO the HCA (`recipient`)
      //   - `sourceAssets` + `tokenRequests` declare the movement, which is
      //     what makes the orchestrator create a source element at all. Without
      //     them there is no source leg and `sourceCalls` are silently dropped
      //     (see the SDK's own caveat on `sourceCalls`).
      //   - `sourceCalls` carry the EIP-2612 permit + `transferFrom` that move
      //     the wallet's USDC into the Nexus, executed as pre-claim ops
      //   - `auxiliaryFunds` are declared on the SOURCE chain/token: the funds
      //     arrive during the intent, so the planner cannot see them yet
      //   - Across is the settlement layer
      //
      // `pullAmount` is the wallet→Nexus `transferFrom` size; `destinationAmount`
      // is what must land on the destination. Both start at the caller's figures
      // and are settled against the route's own quote below.
      const buildCrossChain = (
        pullAmount: bigint,
        destinationAmount: bigint,
      ): Transaction =>
        ({
          sourceChains: [sourceChainForId(crossChain?.chainId ?? 0)],
          targetChain: chain,
          recipient: crossChain?.recipient,
          calls: [...calls],
          // Always user-paid; see UNSPONSORED above.
          sponsored: UNSPONSORED,
          feeAsset: feeAsset ?? DEFAULT_FEE_ASSET,
          ...(gasLimit !== undefined ? { gasLimit } : {}),
          // The destination-token request carries the amount the fee is taken
          // from, so the adaptive retry rewrites it in place.
          tokenRequests: (tokenRequests ?? []).map((tokenRequest) =>
            crossChain &&
            tokenRequest.address.toLowerCase() ===
              crossChain.destinationToken.toLowerCase()
              ? { ...tokenRequest, amount: destinationAmount }
              : tokenRequest,
          ) as TokenRequest[] & Transaction['tokenRequests'],
          ...(sourceAssets
            ? {
                sourceAssets: sourceAssets.map((asset) => ({
                  chain: sourceChainForId(asset.chainId),
                  address: asset.address,
                  amount: asset.amount,
                })),
              }
            : {}),
          ...(sourceCalls && crossChain
            ? {
                sourceCalls: sourceCallsForPull(
                  sourceCalls,
                  {
                    sourceChainId: crossChain.chainId,
                    sourceToken: crossChain.sourceToken,
                    nexus: crossChain.address,
                  },
                  pullAmount,
                ),
              }
            : {}),
          ...(declaredFunds ? { auxiliaryFunds: declaredFunds } : {}),
          settlementLayers: ['ACROSS'],
          ...(sessionSigners ? { signers: sessionSigners } : {}),
        }) as Transaction

      const sdkParams = crossChain
        ? buildCrossChain(sourceBudgetCap ?? 0n, destinationFloor)
        : {
            sourceChains: [chain],
            targetChain: chain,
            // Spread into a fresh mutable array: the SDK's CallInput[] is mutable
            // while rhinestoneParams.calls is readonly.
            calls: [...calls],
            // Always user-paid; see UNSPONSORED above.
            sponsored: UNSPONSORED,
            feeAsset: feeAsset ?? DEFAULT_FEE_ASSET,
            // Pass through caller-provided tokenRequests (for cross-chain txs).
            // Defaults to [] which skips balance validation (needed for local mockestrator).
            // Cast needed: SDK's internal TokenRequests is a strict discriminated union
            // not assignable from TokenRequest[], but semantically equivalent here.
            tokenRequests: (tokenRequests ?? []) as TokenRequest[] &
              Transaction['tokenRequests'],
            ...(declaredFunds ? { auxiliaryFunds: declaredFunds } : {}),
            ...(sessionSigners ? { signers: sessionSigners } : {}),
          }

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
                  : // Scalars include bigints (`gasLimit`), which JSON.stringify
                    // throws on outright — taking the whole submission down
                    // from a debug log.
                    typeof v === 'bigint'
                    ? v.toString()
                    : v,
            ]),
          ),
        ),
      )

      // Cross-chain goes the long way round — prepare, settle the pull against
      // the quote, sign, submit — because `sendTransaction` prepares and signs
      // in one shot, leaving no point at which the wallet→Nexus pull can be
      // corrected to the claim amount the funding validator demands.
      const transaction =
        crossChain && sourceCalls && sourceBudgetCap !== undefined
          ? await (async () => {
              const prepared = await prepareCrossChain(
                sender,
                buildCrossChain,
                {
                  budgetCap: sourceBudgetCap,
                  sourceToken: crossChain.sourceToken,
                  destinationFloor,
                  feeMargin: FEE_MARGIN_USDC,
                },
              )
              const signed = await sender.signTransaction(prepared)
              return sender.submitTransaction(signed)
            })()
          : await sender.sendTransaction(sdkParams as Transaction)
      const sendLatencyMs = nowMs() - sendStart

      // The orchestrator's intent id — the handle for
      // `GET /intent-operation/{id}`, and the only thing that lets Rhinestone
      // look a specific intent up. Deliberately NOT `logger.debug`/`info`,
      // which are gated on `isDev` and so never reach a deployed build; an
      // identifier is worthless if it only exists on a developer's machine.
      // Printed as a decimal string because it is a bigint and JSON/console
      // formatting of one is inconsistent.
      const intentId =
        (transaction as { id?: bigint } | undefined)?.id?.toString() ??
        'unknown'
      // NOTE: no `gasLimit` to report — submitted intents deliberately carry
      // none, so the ceiling on a filled intent is the orchestrator's own
      // estimate, not something this app sets. (`gasLimit` is passed only to
      // `prepareTransaction` when quoting, to size the funding permit.)
      console.log('🧾 [WARP] intent submitted:', {
        intentId,
        chainId: chain.id,
        account: account.getAddress?.(),
        calls: calls.length,
      })

      logger.debug(
        '📤 [WARP] sendTransaction latency (ms):',
        sendLatencyMs.toFixed(1),
      )

      // Wait for a relayer to fill the intent
      const waitStart = nowMs()
      const receipt = await sender.waitForExecution(transaction, false)
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

      // Pair the intent id with the fill hash in ONE line, so a gas or
      // latency report can be handed over without cross-referencing two logs.
      console.log('🧾 [WARP] intent filled:', {
        intentId,
        fillHash: txHash,
        chainId: chain.id,
        totalLatencyMs: Math.round(totalLatencyMs),
      })

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
