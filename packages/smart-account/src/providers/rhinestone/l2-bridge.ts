/**
 * Move the wallet's USDC on an L2 to a smart account on the target chain: the
 * wallet signs one Permit2 witness transfer on the L2, and Across delivers it.
 * Any calls run from Across's handler on the target, not from the recipient,
 * which only receives what is left afterwards; so the recipient's own calls
 * must follow as its own intents.
 */

import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import type {
  IntentRoute,
  PreparedTransactionData,
  RhinestoneAccount,
  RhinestoneAccountConfig,
} from '@rhinestone/sdk'
import { OrchestratorError } from '@rhinestone/sdk/errors'
import {
  err,
  fromPromise,
  fromThrowable,
  ok,
  type Result,
  type ResultAsync,
} from 'neverthrow'
import {
  type Account,
  type Address,
  type Chain,
  isAddress,
  isAddressEqual,
  isHex,
} from 'viem'
import type { RhinestoneAuth } from './auth'
import type { Call } from './registration-calls'
import { createRhinestoneSdk } from './sdk'

/** Canonical Permit2, the only spender a source token is approved for. */
export const PERMIT2_ADDRESS: Address =
  '0x000000000022D473030F116dDEE9F6B43aC78BA3'

/**
 * Rhinestone's Across arbiter, at this address on every L2 source. Permit2 lets
 * the spender pick where the tokens go, so a permit for any other is refused.
 */
export const RHINESTONE_ACROSS_ARBITER: Address =
  '0xA162fabb9a0EeF2736485A587aAAB3d015e14224'

// Quotes are issued for two minutes; one signable for longer is refused.
export const L2_BRIDGE_MAX_PERMIT_LIFETIME_S = 600n
// A signature this close to the deadline is not worth submitting.
const SUBMIT_MARGIN_S = 10n

const unixNow = (): bigint => BigInt(Math.floor(Date.now() / 1000))

/** The most a route may charge over what it delivers: 2%, at least 1 USDC. */
export function l2BridgeMaxFee(amountOut: bigint): bigint {
  const twoPercent = amountOut / 50n
  return twoPercent > 1_000_000n ? twoPercent : 1_000_000n
}

export type L2BridgeRoute = Readonly<{
  /** The wallet paying on the source chain. */
  owner: Address
  sourceChain: Chain
  sourceToken: Address
  targetChain: Chain
  targetToken: Address
  /** What must arrive on the target chain. */
  amountOut: bigint
  /** The smart account paid on the target; its config lets the SDK deploy it. */
  recipient: Readonly<{ address: Address; config: RhinestoneAccountConfig }>
  /** Run on the target by Across's handler, before `recipient` is paid. */
  calls: readonly Call[]
}>

export type L2BridgeQuote = Readonly<{
  route: L2BridgeRoute
  prepared: PreparedTransactionData
  /** What the permit lets the arbiter take on the source chain. */
  amountIn: bigint
  /** What arrives on the target chain, at least `route.amountOut`. */
  amountReceived: bigint
  /** Unix seconds after which the permit is void. */
  deadline: bigint
}>

/** The orchestrator could not quote the route. */
export class L2BridgeUnavailableError extends TaggedError(
  'L2BridgeUnavailableError',
)<{ message: string; cause?: unknown }> {}

/** The quoted route breaks a rule in `validateL2BridgeQuote`; nothing was signed. */
export class L2BridgeRejectedError extends TaggedError(
  'L2BridgeRejectedError',
)<{ message: string }> {}

/** The permit was signed too close to its deadline to submit. */
export class L2BridgeExpiredError extends TaggedError('L2BridgeExpiredError')<{
  message: string
}> {}

/** Signing or submitting failed, including a declined signature. */
export class L2BridgeSubmitError extends TaggedError('L2BridgeSubmitError')<{
  message: string
  cause?: unknown
}> {}

/**
 * The signed intent was submitted but no answer said whether it was accepted,
 * so it may still fill. `intentId` is its nonce, which the orchestrator also
 * looks intents up by.
 */
export class L2BridgeUnconfirmedError extends TaggedError(
  'L2BridgeUnconfirmedError',
)<{ message: string; cause?: unknown; intentId: bigint }> {}

// A 4xx is the orchestrator refusing it; anything else may have been accepted.
const isRefusal = (error: unknown) =>
  error instanceof OrchestratorError &&
  error.statusCode !== undefined &&
  error.statusCode < 500

/** An SDK account for the wallet itself, paying from `eoa` on the source chain. */
export function createL2BridgeAccount(params: {
  readonly eoa: Account
  readonly auth: RhinestoneAuth
  readonly endpointUrl?: string
  readonly rpcUrls: Readonly<Record<number, string>>
}): ResultAsync<RhinestoneAccount, L2BridgeUnavailableError> {
  return fromPromise(
    createRhinestoneSdk(params).createAccount({
      account: { type: 'eoa' },
      eoa: params.eoa,
    }),
    (cause) =>
      new L2BridgeUnavailableError({
        message: 'Could not set up the payment.',
        cause,
      }),
  )
}

/** Quote `route`, returning it only if every rule in `validateL2BridgeQuote` holds. */
export const quoteL2Bridge = ResultFn(async function* (
  account: RhinestoneAccount,
  route: L2BridgeRoute,
  now: () => bigint = unixNow,
) {
  const prepared = yield* fromPromise(
    account.prepareTransaction({
      sourceChains: [route.sourceChain],
      targetChain: route.targetChain,
      sourceAssets: { [route.sourceChain.id]: [route.sourceToken] },
      tokenRequests: [{ address: route.targetToken, amount: route.amountOut }],
      recipient: route.recipient.config,
      calls: [...route.calls],
      sponsored: { gas: false, bridging: false, swaps: false },
    }),
    (cause) =>
      new L2BridgeUnavailableError({
        message: `No route from ${route.sourceChain.name} is available.`,
        cause,
      }),
  )
  const messages = yield* fromThrowable(
    () => account.getTransactionMessages(prepared),
    () => new L2BridgeRejectedError({ message: 'Unreadable route.' }),
  )()
  return validateL2BridgeQuote({ route, prepared, messages, now: now() })
})

type TransactionMessages = ReturnType<
  RhinestoneAccount['getTransactionMessages']
>

type SignedOp = {
  readonly to: string
  readonly value: unknown
  readonly data: string
}

/** The Permit2 batch-witness transfer the SDK builds for an Across route. */
type BridgePermit = {
  readonly permitted: readonly {
    readonly token: string
    readonly amount: bigint
  }[]
  readonly spender: string
  readonly deadline: bigint
  readonly mandate: {
    readonly target: {
      readonly recipient: string
      readonly tokenOut: readonly {
        readonly token: string
        readonly amount: bigint
      }[]
      readonly targetChain: bigint
    }
    readonly originOps: { readonly ops: readonly unknown[] }
    readonly destOps: { readonly ops: readonly SignedOp[] }
  }
}

const sameAddress = (value: unknown, expected: Address): boolean =>
  typeof value === 'string' &&
  isAddress(value, { strict: false }) &&
  isAddressEqual(value, expected)

// Ops come from the orchestrator's JSON, so a value may be a decimal string.
const sameValue = (value: unknown, expected: bigint): boolean => {
  try {
    return BigInt(value as bigint | string) === expected
  } catch {
    return false
  }
}

const sameOp = (op: SignedOp | undefined, call: Call): boolean =>
  !!op &&
  sameAddress(op.to, call.to) &&
  sameValue(op.value, call.value) &&
  isHex(op.data) &&
  op.data.toLowerCase() === call.data.toLowerCase()

/**
 * Accept a prepared route only if what the wallet would sign moves the quoted
 * USDC from the owner on the source chain to the recipient on the target,
 * through Rhinestone's arbiter, running exactly the route's calls there:
 *
 * 1. the intent is the owner's;
 * 2. it has one element, on the source chain, settled by Across from Permit2;
 * 3. the wallet signs one Permit2 batch-witness transfer on the source chain's
 *    canonical Permit2, open now and for at most 10 minutes;
 * 4. its spender is Rhinestone's Across arbiter;
 * 5. it permits only the source token, at most `amountOut` plus the fee cap;
 * 6. it pays the recipient on the target chain;
 * 7. it delivers only the target token, at least `amountOut`;
 * 8. it runs nothing on the source chain, and only `calls`, in order, on the
 *    target;
 * 9. the only setup it asks for is a Permit2 allowance on the source token.
 */
export function validateL2BridgeQuote(params: {
  readonly route: L2BridgeRoute
  readonly prepared: PreparedTransactionData
  readonly messages: TransactionMessages
  readonly now: bigint
}): Result<L2BridgeQuote, L2BridgeRejectedError> {
  const { route, prepared, messages, now } = params
  const rejection = rejectIntent(route, prepared.intentRoute)
  const terms: Result<PermitTerms, string> =
    rejection === undefined ? readPermit(route, messages, now) : err(rejection)
  return terms
    .map((accepted) => ({ route, prepared, ...accepted }))
    .mapErr((message) => new L2BridgeRejectedError({ message }))
}

type PermitTerms = Pick<
  L2BridgeQuote,
  'amountIn' | 'amountReceived' | 'deadline'
>

/** Rules 1, 2 and 9, on the intent itself. */
function rejectIntent(
  route: L2BridgeRoute,
  { intentOp, tokenRequirements }: IntentRoute,
): string | undefined {
  if (!sameAddress(intentOp.sponsor, route.owner)) {
    return 'The route pays from another wallet.'
  }

  const [element, ...otherElements] = intentOp.elements
  const settlement = element?.mandate.qualifier.settlementContext
  if (
    !element ||
    otherElements.length > 0 ||
    Number(element.chainId) !== route.sourceChain.id ||
    settlement?.settlementLayer !== 'ACROSS' ||
    settlement.fundingMethod !== 'PERMIT2'
  ) {
    return 'The route does not pay from the chosen chain.'
  }

  const requirements = Object.entries(tokenRequirements ?? {}).flatMap(
    ([chainId, tokens]) =>
      Object.entries(tokens).map(([token, requirement]) => ({
        chainId: Number(chainId),
        token,
        requirement,
      })),
  )
  const unexpected = requirements.some(
    ({ chainId, token, requirement }) =>
      chainId !== route.sourceChain.id ||
      !sameAddress(token, route.sourceToken) ||
      requirement.type !== 'approval' ||
      !sameAddress(requirement.spender, PERMIT2_ADDRESS),
  )
  return unexpected ? 'The route asks for an unexpected approval.' : undefined
}

/** Rules 3 to 8, on the permit the wallet would sign. */
function readPermit(
  route: L2BridgeRoute,
  messages: TransactionMessages,
  now: bigint,
): Result<PermitTerms, string> {
  const [signed, ...otherSigned] = messages.origin
  if (
    !signed ||
    otherSigned.length > 0 ||
    signed.primaryType !== 'PermitBatchWitnessTransferFrom' ||
    signed.domain?.name !== 'Permit2' ||
    Number(signed.domain.chainId) !== route.sourceChain.id ||
    !sameAddress(signed.domain.verifyingContract, PERMIT2_ADDRESS)
  ) {
    return err('The route asks for an unexpected signature.')
  }
  const permit = signed.message as unknown as BridgePermit
  if (
    permit.deadline <= now ||
    permit.deadline > now + L2_BRIDGE_MAX_PERMIT_LIFETIME_S
  ) {
    return err('The quote has expired.')
  }

  if (!sameAddress(permit.spender, RHINESTONE_ACROSS_ARBITER)) {
    return err('The route does not settle through Rhinestone.')
  }

  const [permitted, ...otherPermitted] = permit.permitted
  if (
    !permitted ||
    otherPermitted.length > 0 ||
    !sameAddress(permitted.token, route.sourceToken) ||
    permitted.amount > route.amountOut + l2BridgeMaxFee(route.amountOut)
  ) {
    return err('The route costs more than allowed.')
  }

  const { target, originOps, destOps } = permit.mandate
  if (
    !sameAddress(target.recipient, route.recipient.address) ||
    target.targetChain !== BigInt(route.targetChain.id)
  ) {
    return err('The route pays another account or chain.')
  }

  const [received, ...otherReceived] = target.tokenOut
  if (
    !received ||
    otherReceived.length > 0 ||
    !sameAddress(received.token, route.targetToken) ||
    received.amount < route.amountOut
  ) {
    return err('The route delivers less than requested.')
  }

  if (
    originOps.ops.length > 0 ||
    destOps.ops.length !== route.calls.length ||
    !route.calls.every((call, index) => sameOp(destOps.ops[index], call))
  ) {
    return err('The route runs other operations than requested.')
  }

  return ok({
    amountIn: permitted.amount,
    amountReceived: received.amount,
    deadline: permit.deadline,
  })
}

/**
 * Have the wallet sign the quoted permit and submit the intent. A signature
 * that lands too close to the deadline is not submitted.
 */
export const submitL2Bridge = ResultFn(async function* (
  account: RhinestoneAccount,
  quote: L2BridgeQuote,
  now: () => bigint = unixNow,
) {
  const signed = yield* fromPromise(
    account.signTransaction(quote.prepared),
    (cause) =>
      new L2BridgeSubmitError({
        message: 'The payment was not signed.',
        cause,
      }),
  )
  if (now() + SUBMIT_MARGIN_S >= quote.deadline) {
    return err(
      new L2BridgeExpiredError({
        message: 'The quote expired before it was signed.',
      }),
    )
  }
  const submitted = yield* fromPromise(
    account.submitTransaction(signed),
    (cause) =>
      isRefusal(cause)
        ? new L2BridgeSubmitError({
            message: 'The payment could not be submitted.',
            cause,
          })
        : new L2BridgeUnconfirmedError({
            message: 'The payment was sent, but not confirmed.',
            cause,
            intentId: BigInt(quote.prepared.intentRoute.intentOp.nonce),
          }),
  )
  return ok(submitted)
})
