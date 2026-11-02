import { TaggedError } from './neverthrow/error-classes.js'

/**
 * Thrown by `invariant` when a belief the code holds about its own state is
 * false. Only a bug in our code gets here, so nothing catches it on purpose:
 * it travels to the nearest error boundary and the error report. `cause` is
 * always undefined: a broken belief has no underlying error.
 */
export class InvariantViolation extends TaggedError('InvariantViolation')<{
  readonly message: string
  readonly cause: unknown
}> {}

/**
 * Asserts an invariant: a belief the code holds about its own state, which
 * only a bug in our code can break. When `condition` is falsy it throws an
 * InvariantViolation carrying `message`; after the call TypeScript narrows
 * `condition` as an `if` would.
 *
 * A surprising value from outside (network, user, storage, chain) is input,
 * not an invariant: validate it at the edge and return the failure as a value.
 *
 * The message stays in production builds so an error report names the broken
 * belief. Say what the code expected, and leave out user data and secrets.
 *
 * @example
 * ```ts
 * invariant(context.signer, 'the renew step runs only once a signer is set')
 * ```
 */
export function invariant(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new InvariantViolation({ message, cause: undefined })
}
