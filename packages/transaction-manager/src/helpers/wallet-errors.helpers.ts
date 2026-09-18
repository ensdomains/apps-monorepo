import { UnauthorizedProviderError, UserRejectedRequestError } from 'viem'

/** 4001: the user declined. 4100: the wallet refused to ask (spam filter). */
const TERMINAL_CODES: ReadonlySet<number> = new Set([4001, 4100])

const TERMINAL_NAMES: ReadonlySet<string> = new Set([
  'UserRejectedRequestError',
  'UnauthorizedProviderError',
])

/**
 * Whether the wallet refused in a way retrying cannot fix.
 *
 * Matched by name and code as well as class: the transports wrap the viem error
 * so the chain has to be walked, and class identity does not survive the
 * production build.
 */
export const isTerminalWalletError = (error: unknown): boolean => {
  let current: unknown = error
  // Bounded so a cyclic `cause` cannot spin.
  for (let depth = 0; depth < 10 && current != null; depth += 1) {
    if (
      current instanceof UserRejectedRequestError ||
      current instanceof UnauthorizedProviderError
    ) {
      return true
    }
    const { name, code } = current as { name?: unknown; code?: unknown }
    if (typeof name === 'string' && TERMINAL_NAMES.has(name)) return true
    if (typeof code === 'number' && TERMINAL_CODES.has(code)) return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}
