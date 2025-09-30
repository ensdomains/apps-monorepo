import { err, fromPromise, ok, type Result, ResultAsync } from 'neverthrow'

const AppErrorSymbol = Symbol('AppError')

export type GenericError = {
  code: string
  message: string
  [AppErrorSymbol]?: true
}

export function rawError<const T extends GenericError>(error: T) {
  error[AppErrorSymbol] = true
  return error
}

export function error<const T extends GenericError>(error: T) {
  error[AppErrorSymbol] = true
  return err(error)
}

export const isAppError = <T extends GenericError>(
  error: unknown,
): error is T => {
  return typeof error === 'object' && error !== null && 'code' in error
}

export function createIntoError<const TCode extends string>(code: TCode) {
  return (_error: unknown) => {
    const error =
      _error instanceof Error
        ? _error
        : new Error('Unknown error', {
            cause: _error,
          })

    return rawError({
      code,
      message: error.message as string & {},
      error,
    })
  }
}

export function createIntoResult<TData, TError extends GenericError>(
  intoError: (error: unknown) => TError,
) {
  return (promise: Promise<TData>) => {
    return fromPromise(promise, intoError)
  }
}

/**
 * Retrieves the first item from an array or returns a fallback result.
 *
 * If the array is empty, the fallback will be returned directly.
 * If the array is not empty, the first item will be returned.
 *
 */
export function getFirstOrFallback<TData, TFallback extends Result<TData, any>>(
  fallback: TFallback | ((data: TData[]) => TFallback),
) {
  return (array: TData[]) => {
    const item = array.at(0)
    if (!item) {
      return typeof fallback === 'function' ? fallback(array) : fallback
    }

    return ok(item)
  }
}

export type InferOkTypes<R> = R extends Result<infer T, unknown>
  ? T
  : R extends ResultAsync<infer T, unknown>
    ? T
    : never
export type InferErrTypes<R> = R extends Result<unknown, infer E>
  ? E
  : R extends ResultAsync<unknown, infer E>
    ? E
    : never

export function asyncRes<TResultPromise extends Promise<Result<any, any>>>(
  promise: TResultPromise,
) {
  return new ResultAsync<
    InferOkTypes<Awaited<TResultPromise>>,
    InferErrTypes<Awaited<TResultPromise>>
  >(promise)
}

export type SerializedResult<TData, TError> =
  | {
      ok: true
      data: TData
    }
  | {
      ok: false
      error: TError
    }

// Serialize and deserialize a result
export function serializeResult<TData, TError extends GenericError>(
  result: Result<TData, TError>,
): SerializedResult<TData, TError> {
  return result.isOk()
    ? { ok: true as const, data: result.value }
    : { ok: false as const, error: result.error }
}

export function deserializeResult<TData, TError extends GenericError>(
  serialized: SerializedResult<TData, TError>,
) {
  return serialized.ok ? ok(serialized.data) : err(serialized.error)
}
