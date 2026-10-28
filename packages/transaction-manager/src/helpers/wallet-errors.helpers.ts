import {
  AtomicReadyWalletRejectedUpgradeError,
  UnauthorizedProviderError,
  UserRejectedRequestError,
} from 'viem'

/** 4001: the user declined. 4100: the wallet refused to ask (spam filter). */
const DECLINED_CODE = 4001
const UNAUTHORIZED_CODE = 4100
/** EIP-5792: the user declined the EIP-7702 upgrade a `ready` wallet asked for. */
const UPGRADE_DECLINED_CODE = 5750

type WalletErrorMatcher = {
  readonly classes: readonly (new (...args: never[]) => Error)[]
  readonly names: ReadonlySet<string>
  readonly codes: ReadonlySet<number>
}

const DECLINED: WalletErrorMatcher = {
  classes: [UserRejectedRequestError],
  names: new Set(['UserRejectedRequestError']),
  codes: new Set([DECLINED_CODE]),
}

const TERMINAL: WalletErrorMatcher = {
  classes: [UserRejectedRequestError, UnauthorizedProviderError],
  names: new Set(['UserRejectedRequestError', 'UnauthorizedProviderError']),
  codes: new Set([DECLINED_CODE, UNAUTHORIZED_CODE]),
}

const UPGRADE_DECLINED: WalletErrorMatcher = {
  classes: [AtomicReadyWalletRejectedUpgradeError],
  names: new Set(['AtomicReadyWalletRejectedUpgradeError']),
  codes: new Set([UPGRADE_DECLINED_CODE]),
}

/**
 * Matched by name and code as well as class: the transports wrap the viem error
 * so the chain has to be walked, and class identity does not survive the
 * production build.
 */
const matchesWalletError = (
  error: unknown,
  matcher: WalletErrorMatcher,
): boolean => {
  let current: unknown = error
  // Bounded so a cyclic `cause` cannot spin.
  for (let depth = 0; depth < 10 && current != null; depth += 1) {
    if (matcher.classes.some((cls) => current instanceof cls)) return true
    const { name, code } = current as { name?: unknown; code?: unknown }
    if (typeof name === 'string' && matcher.names.has(name)) return true
    if (typeof code === 'number' && matcher.codes.has(code)) return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

/** Whether the user declined the wallet prompt: a decision, not a failure. */
export const isWalletDeclineError = (error: unknown): boolean =>
  matchesWalletError(error, DECLINED)

/** Whether the wallet refused in a way retrying cannot fix: a decline, or a 4100 refusal to ask. */
export const isTerminalWalletError = (error: unknown): boolean =>
  matchesWalletError(error, TERMINAL)

/** Whether the user declined the account upgrade an atomic bundle asked for. */
export const isUpgradeDeclineError = (error: unknown): boolean =>
  matchesWalletError(error, UPGRADE_DECLINED)
