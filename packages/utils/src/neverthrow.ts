/**
 * @fileoverview Neverthrow utilities for functional error handling
 *
 * This module provides utilities for working with neverthrow's Result type,
 * including generator-based error handling, tagged error classes, and
 * result helpers.
 *
 * @example
 * ```typescript
 * import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
 *
 * // Create a tagged error
 * class DatabaseError extends TaggedError('DATABASE_ERROR')<{ cause: unknown }> {}
 *
 * // Use generator-based error handling
 * const processUser = ResultFn(async function* (userId: string) {
 *   const user = yield* fromPromise(
 *     db.query.users.findFirst({ where: eq(users.id, userId) }),
 *     (cause) => new DatabaseError({ cause }),
 *   )
 *   return ok(user)
 * })
 * ```
 */

// Error classes and factories
export {
  DataError,
  TaggedError,
  YieldableError,
} from './neverthrow/error-classes.js'
// Generator-based error handling
export {
  fromSync,
  type InferErrTypes as GeneratorInferErrTypes,
  type InferOkTypes as GeneratorInferOkTypes,
  ResultFn,
} from './neverthrow/generator-functions.js'

// Result utilities
export {
  fromThrowableV2,
  getFirstOrFallback,
  type InferErrTypes,
  type InferOkTypes,
} from './neverthrow/result-helpers.js'

// Type utilities (re-exported for convenience, but prefer importing from specific files)
export type {
  Equals as TypeEquals,
  InferErrTypes as TypeInferErrTypes,
  InferOkTypes as TypeInferOkTypes,
} from './neverthrow/type-utilities.js'
