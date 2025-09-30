import { fromPromise, type ResultAsync } from 'neverthrow'
import { rawError } from '../../utils/result'

export const KV_KEY = {
  AUTH: {
    NONCE: (nonce: string) => `auth:nonce:${nonce}`,
  },
}

export const intoKVError = (err: unknown) => {
  const error =
    err instanceof Error
      ? err
      : new Error('Unknown KV error', {
          cause: err,
        })

  return rawError({
    code: 'KV_ERROR',
    message: error.message,
    error,
  })
}

export type KVError = ReturnType<typeof intoKVError>

export const intoKVResult = <T>(
  promise: PromiseLike<T>,
): ResultAsync<T, KVError> => {
  return fromPromise(promise, intoKVError)
}
