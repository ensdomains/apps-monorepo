/**
 * @fileoverview The typed on-chain identity of a name or an access-control
 * resource, and the preflight that proves signed calldata addresses it.
 *
 * A v2 registry setter takes a `uint256 anyId`; an `EnhancedAccessControl`
 * check takes a `uint256 resource`. Both are numbers, and both are easy to
 * rebuild from whatever string happens to be on screen. That is the mistake
 * this module exists to make impossible:
 *
 * - `labelhash()` does not hash a label written as `[<64 hex>]`. It reads it as
 *   an already-hashed label and returns the digits verbatim. That form is
 *   ambiguous from the string alone: it is how ENS *renders* a label whose
 *   preimage nothing has seen (and then the digits really are the id), and it
 *   is also what a label literally registered as those 66 characters looks like
 *   (and then the id is the hash of the characters). The two are different
 *   names, so an id guessed from the string can address the wrong one.
 * - Coercing an id that could not be read into `0n` hands the caller the root
 *   resource: the broadest scope there is, reached by a failure rather than by
 *   a choice.
 *
 * So: {@link ResourceId} is branded and can only be produced by the fail-closed
 * conversions below, {@link ROOT_RESOURCE_ID} is an explicit constant no failed
 * conversion can return, and {@link assertCalldataResourceId} re-reads the
 * encoded call right before the wallet opens.
 */

import { TaggedError } from '@ens-apps/utils/neverthrow'
import { err, ok, type Result } from 'neverthrow'
import { type Abi, decodeFunctionData, type Hex, labelhash } from 'viem'

declare const resourceIdBrand: unique symbol

/**
 * A resource id the app is certain of, carried from the row or route the
 * operator selected all the way to the calldata that gets signed.
 *
 * The brand is the point: a plain `bigint` will not type-check where one of
 * these is expected, so no write path can quietly go back to hashing a display
 * string.
 */
export type ResourceId = bigint & { readonly [resourceIdBrand]: true }

export type ResourceIdFailure =
  /**
   * The first label is written in `[<64 hex>]` form. Which name that is cannot
   * be told from the string, so the id has to come from a typed source
   * (`useNameResourceId` asks the indexer) rather than be guessed here.
   */
  | 'encoded-label'
  /** There is no first label to hash. */
  | 'empty-label'
  /** The chain or indexer value is not a number we can read. */
  | 'malformed-resource'

export class ResourceIdError extends TaggedError('ResourceIdError')<{
  reason: ResourceIdFailure
  message: string
}> {}

const unchecked = (value: bigint): ResourceId => value as ResourceId

/**
 * The root resource: every name on a registry, every record on a resolver.
 *
 * Declared here as its own constant so that "root" is always something a caller
 * asked for. No conversion in this module can return it by accident.
 */
export const ROOT_RESOURCE_ID: ResourceId = unchecked(0n)

/** 32-byte hash, as the indexer and the chain hand it to us. */
const HASH_32 = /^0x[0-9a-fA-F]{64}$/
/** Unsigned decimal, the other shape the indexer uses for a resource. */
const DECIMAL = /^[0-9]+$/

const MAX_UINT256 = (1n << 256n) - 1n

/**
 * An id that came from the chain or the indexer — a subname's `labelhash`, an
 * EAC `resource` — rather than from anything rendered.
 *
 * This is the preferred source: it is the authority the contract itself used,
 * so nothing has to be re-derived from a name.
 */
export const resourceIdFromChainValue = (
  // `unknown`, not `string | bigint`: the indexer's shape is a TypeScript
  // assertion, not a runtime guarantee, and a nulled GraphQL field reaching a
  // `.trim()` would take a whole route down instead of degrading one row.
  value: unknown,
): Result<ResourceId, ResourceIdError> => {
  if (typeof value === 'bigint') {
    return value >= 0n && value <= MAX_UINT256
      ? ok(unchecked(value))
      : err(
          new ResourceIdError({
            reason: 'malformed-resource',
            message: `Resource ${value} is outside the uint256 range`,
          }),
        )
  }

  if (typeof value !== 'string')
    return err(
      new ResourceIdError({
        reason: 'malformed-resource',
        message: `Could not read a resource id from a ${value === null ? 'null' : typeof value} value`,
      }),
    )

  const trimmed = value.trim()
  if (!HASH_32.test(trimmed) && !DECIMAL.test(trimmed))
    return err(
      new ResourceIdError({
        reason: 'malformed-resource',
        message: `Could not read "${value}" as a resource id`,
      }),
    )

  return resourceIdFromChainValue(BigInt(trimmed))
}

/**
 * Exactly what `labelhash` would pass through unhashed: `[` + 64 hex + `]`.
 * Mirrors viem's own `encodedLabelToLabelhash`, which is what decides whether
 * a label is hashed or read as an id.
 */
const ENCODED_LABEL = /^\[[0-9a-fA-F]{64}\]$/

/**
 * The id of a name from the name alone: the hash of its first label, exactly as
 * the registry hashed it at registration.
 *
 * The label is taken verbatim. Normalisation is deliberately *not* applied:
 * which resource an existing name occupies was decided when it was registered,
 * and re-normalising here would address a different resource than the one the
 * owner actually holds. Normalisation belongs on the registration path.
 *
 * The one refusal is the `[<64 hex>]` form, because that string does not say
 * which name it is — see the note at the top of this file. Callers that need
 * those names to stay manageable resolve the id from the indexer instead
 * (`useNameResourceId`); this function only declines to guess.
 */
export const resourceIdForName = (
  name: string,
): Result<ResourceId, ResourceIdError> => {
  const label = name.split('.')[0] ?? ''

  if (label.length === 0)
    return err(
      new ResourceIdError({
        reason: 'empty-label',
        message: `"${name}" has no first label`,
      }),
    )

  if (ENCODED_LABEL.test(label))
    return err(
      new ResourceIdError({
        reason: 'encoded-label',
        message: `The first label of "${name}" is written as an encoded labelhash, which does not say which name it is. Its id has to come from the indexer.`,
      }),
    )

  return ok(unchecked(BigInt(labelhash(label))))
}

/**
 * {@link resourceIdForName} for the calldata builders, which are already
 * throw-based and are called inside the transaction modal's error boundary.
 * Refusing loudly is the point: there is no safe id to fall back to.
 */
export const requireResourceIdForName = (name: string): ResourceId =>
  resourceIdForName(name).match(
    (id) => id,
    (error) => {
      throw error
    },
  )

/**
 * The same name, with the token version bits cleared — what the registry's
 * role storage is keyed on. Equivalent to ensjs' `labelToCanonicalId`, but it
 * takes an id we already trust instead of a label string.
 */
export const canonicalResourceId = (id: ResourceId): ResourceId =>
  unchecked(id & ~0xffffffffn)

/** Raised by the preflights below; never expected to be caught and ignored. */
export class ResourceMismatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ResourceMismatchError'
  }
}

type CalldataCheck = {
  readonly abi: Abi | readonly unknown[]
  readonly data: Hex
  /** What is about to be written, for the refusal message. */
  readonly action: string
}

/**
 * The last gate before the wallet opens: decode the call that is about to be
 * signed and refuse it unless its resource argument is the id the operator's
 * selection resolved to.
 *
 * Cheap, and it does not trust the encoder — if a builder ever goes back to
 * deriving the id from a name, this is what stops the transaction.
 */
export const assertCalldataResourceId = ({
  abi,
  data,
  expected,
  action,
  argIndex = 0,
}: CalldataCheck & {
  readonly expected: ResourceId
  readonly argIndex?: number
}): void => {
  const { args } = decodeFunctionData({ abi: abi as Abi, data })
  const actual = args?.[argIndex]

  if (typeof actual !== 'bigint')
    throw new ResourceMismatchError(
      `${action} was refused: the encoded call carries no resource id at argument ${argIndex}.`,
    )

  if (actual !== expected)
    throw new ResourceMismatchError(
      `${action} was refused: the encoded call targets resource ${actual}, but the selected name resolves to ${expected}.`,
    )
}

/**
 * Preflight for calls that carry no resource argument because the scope is the
 * contract's own root: assert the encoded call really is the root-scoped
 * function, so a root-scoped write can never be mistaken for a narrow one.
 */
export const assertCalldataFunction = ({
  abi,
  data,
  functionName,
  action,
}: CalldataCheck & { readonly functionName: string }): void => {
  const decoded = decodeFunctionData({ abi: abi as Abi, data })

  if (decoded.functionName !== functionName)
    throw new ResourceMismatchError(
      `${action} was refused: the encoded call is ${decoded.functionName}, not ${functionName}.`,
    )
}
