import type { Address } from 'viem'

/**
 * Identity of one attempt at a multi-step flow.
 *
 * Transaction actors live in a module-level map keyed by id, and a terminal
 * actor stays in that map on purpose — the modal reads a finished step's
 * status, hash and actual gas cost straight off its snapshot. A flow that
 * names its steps with a fixed id therefore matches the actor an *earlier*
 * attempt left behind: the step reads as already done, its `onDone` fires,
 * and nothing is ever sent to the wallet.
 *
 * A scope pins an id to one attempt AND to the wallet that started it, so
 * neither a second attempt nor a different connected account can have a step
 * satisfied by an earlier receipt. Build one per attempt (at the point the
 * flow clears the manager and opens its modal) and drop it when the flow
 * finishes.
 */
export type FlowScope = {
  /** The wallet that started this attempt, lower-cased. */
  readonly account: Address
  /** Distinguishes two attempts by the same wallet in one session. */
  readonly nonce: string
}

/**
 * Kept out of the base ids themselves so the scoped id still starts with the
 * id a reader (or a console-log matcher) recognises.
 */
const SCOPE_SEPARATOR = '--'

/**
 * A short random token. Uses the Web Crypto API where available and falls
 * back to `Math.random` only so an id still exists without it — these tokens
 * distinguish attempts, they are not secrets.
 */
export function randomNonce(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  ) {
    return Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

/** Starts a new attempt for `account`. */
export function createFlowScope(account: Address): FlowScope {
  return { account: account.toLowerCase() as Address, nonce: randomNonce() }
}

const scopeSuffix = (scope: FlowScope): string =>
  `${SCOPE_SEPARATOR}${scope.account}-${scope.nonce}`

/**
 * Names a step of one attempt. Returns `baseId` unchanged when there is no
 * attempt in progress, so a flow can render its steps before it has started.
 */
export function scopeTransactionId(
  baseId: string,
  scope: FlowScope | null | undefined,
): string {
  return scope ? `${baseId}${scopeSuffix(scope)}` : baseId
}
