import { DrizzleError } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { fromPromise, type ResultAsync } from 'neverthrow'
import { rawError } from '#utils/result.js'
import * as schema from './schema'

export const getDatabase = (env: CloudflareBindings) => {
  const db = drizzle(env.DB.connectionString, {
    schema,
  })

  return db
}

export type Database = ReturnType<typeof getDatabase>

export const intoDbError = (err: unknown) => {
  const error =
    err instanceof Error || err instanceof DrizzleError
      ? err
      : new Error('Unknown database error', {
          cause: err,
        })

  return rawError({
    code: 'DATABASE_ERROR',
    message: error.message,
    error,
  })
}

export type DatabaseError = ReturnType<typeof intoDbError>

export const intoDbResult = <T>(
  promise: PromiseLike<T>,
): ResultAsync<T, DatabaseError> => {
  return fromPromise(promise, intoDbError)
}

export * as schema from './schema/index.js'
