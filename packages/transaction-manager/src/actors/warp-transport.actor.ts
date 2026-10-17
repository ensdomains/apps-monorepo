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

import {
  findGasRefundViolations,
  l2BridgeMaxFee,
  quoteL2Bridge,
  readQuotedGasRefunds,
  submitL2Bridge,
} from '@ens-apps/smart-account'
import { logger } from '@ens-apps/utils/logger'
import type {
  RhinestoneAccount,
  TokenRequest,
  Transaction,
} from '@rhinestone/sdk'
import { errAsync, fromPromise, type ResultAsync } from 'neverthrow'
import { type Chain, type Hash, isAddress } from 'viem'
import {
  ChainIdMismatchError,
  extractOrchestratorErrorContext,
  L2PaymentNotSentError,
  SessionRefundCapExceededError,
  TransactionSubmissionError,
} from '../errors/transaction.errors'
import type { L2FundingSource, RhinestoneSigner } from '../types/signer.types'
import type {
  RhinestoneTransactionRequest,
  SessionEnableData,
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

/**
 * Check a session-signed intent's quoted gas refund against the caps its
 * session was authorized with, exactly as `HCAOwnerAndSessionValidator` will.
 *
 * The SDK signs whatever refund the orchestrator quotes, and an over-cap one
 * is accepted for submission and only fails at fill time — reported back as a
 * bare `Intent failed (errorType=Unknown)`. Checking first turns that into an
 * error that says which cap, before anything is signed.
 *
 * Skipped when the proof carries no session config: the SDK then decodes the
 * caps from an enable call in the batch, which this cannot see.
 */
export function checkSessionRefundCaps(
  request: TransactionRequest,
  intentRoute: unknown,
  enableData: SessionEnableData | undefined,
): SessionRefundCapExceededError | undefined {
  const config = enableData?.hcaSessionConfig
  if (!config) return undefined
  const caps = {
    maxRefundExchangeRate: BigInt(config.maxRefundExchangeRate),
    maxRefundGasOverhead: BigInt(config.maxRefundGasOverhead),
    maxRefundAmount: BigInt(config.maxRefundAmount),
  }
  const violations = readQuotedGasRefunds(intentRoute).flatMap((refund) =>
    findGasRefundViolations(refund, caps, config.refundToken),
  )
  return violations.length > 0
    ? new SessionRefundCapExceededError(request, violations)
    : undefined
}

/** {@link checkSessionRefundCaps}, logged and thrown. */
function assertWithinSessionRefundCaps(
  request: TransactionRequest,
  intentRoute: unknown,
  enableData: SessionEnableData | undefined,
): void {
  const capError = checkSessionRefundCaps(request, intentRoute, enableData)
  if (!capError) return
  logger.error('🛑 [WARP] Quoted gas refund exceeds the session caps', {
    violations: capError.violations.map((v) => ({
      field: v.field,
      quoted: v.quoted.toString(),
      cap: v.cap.toString(),
    })),
  })
  throw capError
}

/** Hand the intent id to the request's observer; a broken one must not fail the send. */
function reportIntentSubmitted(
  request: RhinestoneTransactionRequest,
  intentId: bigint | undefined,
): void {
  if (intentId === undefined) return
  try {
    request.rhinestoneParams.onIntentSubmitted?.(intentId)
  } catch (error) {
    logger.debug('⚠️ [WARP] onIntentSubmitted observer threw:', error)
  }
}

const unwrap = <T, E>(result: ResultAsync<T, E>): Promise<T> =>
  result.match(
    (value) => value,
    (error) => {
      throw error
    },
  )

/**
 * An intent the wallet pays from an L2. The quote must pass
 * `validateL2BridgeQuote` before the wallet is asked to sign, and the HCA runs
 * the calls on `chain` once Across delivers the request's one token request.
 */
function submitL2FundedIntent(
  request: RhinestoneTransactionRequest,
  hca: RhinestoneAccount,
  chain: Chain,
  source: L2FundingSource,
): ResultAsync<Hash, TransactionSubmissionError> {
  const [payment, ...otherPayments] =
    request.rhinestoneParams.tokenRequests ?? []
  if (
    !payment ||
    payment.amount === undefined ||
    !isAddress(payment.address) ||
    otherPayments.length > 0
  ) {
    return errAsync(
      new L2PaymentNotSentError(
        request,
        new Error('An L2-paid intent needs exactly one token request'),
      ),
    )
  }
  const targetToken = payment.address
  const amountOut = payment.amount
  let isSubmitted = false
  let step = 'approve USDC for Permit2'

  return fromPromise(
    (async () => {
      // Approve first: an approval can outlast a two-minute quote.
      await source.ensureAllowance(amountOut + l2BridgeMaxFee(amountOut))
      step = 'reach the wallet'
      const wallet = await source.getAccount()
      step = 'quote the payment'
      const quote = await unwrap(
        quoteL2Bridge(wallet, {
          owner: wallet.getAddress(),
          sourceChain: source.chain,
          sourceToken: source.token,
          targetChain: chain,
          targetToken,
          amountOut,
          recipient: { address: hca.getAddress(), config: hca.config },
          calls: request.rhinestoneParams.calls,
        }),
      )
      step = 'sign the payment'
      const intent = await unwrap(submitL2Bridge(wallet, quote))
      isSubmitted = true
      reportIntentSubmitted(request, intent.id)
      console.log('🧾 [WARP] L2-paid intent submitted:', {
        intentId: intent.id.toString(),
        sourceChainId: source.chain.id,
        amountIn: quote.amountIn.toString(),
      })

      const status = await wallet.waitForExecution(intent, false)
      if (!status.fill.hash) {
        throw new Error('No transaction hash returned from Warp execution')
      }
      console.log('🧾 [WARP] L2-paid intent filled:', {
        intentId: intent.id.toString(),
        fillHash: status.fill.hash,
      })
      return status.fill.hash
    })(),
    (error) => {
      logger.error(`🛑 [WARP] L2 payment failed (${step}):`, error)
      if (isSubmitted) return new TransactionSubmissionError(request, error)
      // Named, so the screen says which step failed even when a wallet
      // rejects with a bare object rather than an Error.
      return new L2PaymentNotSentError(
        request,
        new Error(
          `Could not ${step} on ${source.chain.name}: ${describeError(error)}`,
          { cause: error },
        ),
      )
    },
  )
}

const describeError = (error: unknown): string => {
  if (error instanceof Error) return error.message
  const message = (error as { message?: unknown } | null)?.message
  if (typeof message === 'string') return message
  try {
    return JSON.stringify(error, (_, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    )
  } catch {
    return String(error)
  }
}

export function submitWarpTransaction(
  input: SubmitWarpTransactionInput,
): ResultAsync<
  Hash,
  | TransactionSubmissionError
  | ChainIdMismatchError
  | SessionRefundCapExceededError
> {
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

  // The signer's chain is handed to the orchestrator as BOTH `sourceChains` and
  // `targetChain`, so it decides where the intent is planned, quoted and
  // filled. It used to fall back to `sepolia` when `config.chain` was unset,
  // which silently re-routed the whole intent away from the chain the calls
  // were built for. Assert instead — the session digest binds a chain on-chain
  // and would fail with an opaque `InvalidSignature()` at best.
  //
  // This cannot fire today: manager is the only warp consumer and sets
  // `config.chain` to `customSepolia` unconditionally, with `request.chainId`
  // derived from the same constant. So this states the invariant rather than
  // closing a live hole — the EOA guard is the one that bites — and keeps the
  // next signer wiring from quietly reintroducing the default.
  const chain = config.chain
  if (!chain || chain.id !== request.chainId) {
    logger.error('Warp intent chain mismatch', {
      requestChainId: request.chainId,
      signerChainId: chain?.id,
    })
    return errAsync(new ChainIdMismatchError(request.chainId, chain))
  }

  const { calls, feeAsset, sessionEnableData, tokenRequests, auxiliaryFunds } =
    request.rhinestoneParams

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

  // The validator is stateless: a session signature without the owner's
  // authorization (envelope 0x01/0x02) reverts InvalidSessionData(), which the
  // router surfaces as an opaque UnclassifiedRevert. Refuse it here instead.
  const enableData = sessionEnableData ?? signer.session?.enableData
  if (signer.session && !enableData) {
    return errAsync(
      new TransactionSubmissionError(
        request,
        new Error(
          'A session-signed intent needs the session enable data: the ' +
            'standalone HCA validator rejects session signatures without it',
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

  // Runtime guard: ensure we have a RhinestoneAccount.
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

  if (signer.l2Funding) {
    return submitL2FundedIntent(request, account, chain, signer.l2Funding)
  }

  const nowMs = (): number =>
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()

  const overallStart = nowMs()

  // Authorization: if the signer carries an active scoped session, the SDK
  // signs this Intent with the ephemeral SESSION KEY (no wallet prompt) via
  // `experimental_session`, always with `enableData` (checked above). Without
  // a session we omit `signers` and the SDK uses the connected owner
  // (owner-signed).
  const sessionSigners =
    signer.session && enableData
      ? ({
          type: 'experimental_session' as const,
          session: signer.session.session,
          enableData,
          verifyExecutions: true,
        } satisfies NonNullable<Transaction['signers']>)
      : undefined

  // Funds arriving DURING this intent (the HCA's `permit` + `transferFrom`
  // pair). The planner only credits balances it can already see, so without
  // this it refuses to quote whenever the account's standing balance is below
  // the fee.
  const declaredFunds = auxiliaryFunds as Transaction['auxiliaryFunds']

  return fromPromise(
    (async () => {
      // `chain` is the one asserted above: it is a `const`, so TypeScript keeps
      // the non-undefined narrowing from the guard into this closure, and there
      // is no fallback here to paper over an absent `config.chain`.
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

      const sdkParams = {
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

      // Not `sendTransaction`: the SDK's one-shot helper drops `auxiliaryFunds`
      // from the route request, so a fresh HCA funded inside this intent is refused.
      const prepared = await account.prepareTransaction(sdkParams)
      assertWithinSessionRefundCaps(
        request,
        prepared.intentRoute,
        sessionSigners?.enableData,
      )
      const signed = await account.signTransaction(prepared)
      const transaction = await account.submitTransaction(signed)
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

      // Hand the id to the caller before waiting on the fill: a tab closed
      // mid-fill is precisely the case the observer exists for.
      reportIntentSubmitted(
        request,
        (transaction as { id?: bigint } | undefined)?.id,
      )
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
      // Already explains itself, and callers branch on its type.
      if (error instanceof SessionRefundCapExceededError) return error

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
