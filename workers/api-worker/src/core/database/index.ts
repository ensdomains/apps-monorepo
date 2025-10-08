import { DrizzleError, DrizzleQueryError } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import type { AnyPgTable } from 'drizzle-orm/pg-core'
import { fromPromise, type ResultAsync } from 'neverthrow'
import { rawError } from '#utils/result.js'
import * as schema from './schema'
import { TaggedError } from '@ens-apps/utils/neverthrow'

export const getDatabase = (env: CloudflareBindings) => {
  const db = drizzle(env.DB.connectionString, {
    schema,
  })

  return db
}

export type Database = ReturnType<typeof getDatabase>

export class DatabaseError extends TaggedError('DATABASE_ERROR')<{
  cause: DrizzleQueryError | DrizzleError
}> {}

export const intoDbError = (err: unknown) => {
  const error =
    err instanceof DrizzleError || err instanceof DrizzleQueryError
      ? err
      : new Error('Unknown database error', {
          cause: err,
        })

  return new DatabaseError({
    cause: error,
  })
}

export const intoDbResult = <T>(
  promise: PromiseLike<T>,
): ResultAsync<T, DatabaseError> => {
  return fromPromise(promise, intoDbError)
}

export const TABLE: {
  [K in keyof typeof schema as (typeof schema)[K] extends AnyPgTable
    ? K
    : never]: (typeof schema)[K]
} = schema

export * as schema from './schema/index.js'
