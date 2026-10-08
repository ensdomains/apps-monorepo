import * as v from 'valibot'

/**
 * Shared wire contract for per-user transaction history.
 *
 * Single source of truth for the request body the transaction manager reports
 * and the api-worker validates, so the picklists (status, operation) are not
 * duplicated across the worker route, its DB schema, and the manager app.
 */

export const TransactionStatusSchema = v.picklist([
  'pending',
  'success',
  'error',
  'cancelled',
])
export type TransactionStatus = v.InferOutput<typeof TransactionStatusSchema>

export const TransactionOperationSchema = v.picklist([
  'ens-renewal',
  'registration',
  'set-resolver',
  'set-primary-name',
  'custom',
])
export type TransactionOperation = v.InferOutput<
  typeof TransactionOperationSchema
>

export const TransactionPayloadSchema = v.strictObject({
  to: v.optional(v.pipe(v.string(), v.maxLength(128))),
  value: v.optional(v.pipe(v.string(), v.maxLength(128))),
  error: v.optional(v.pipe(v.string(), v.maxLength(16 * 1024))),
})
export type TransactionPayload = v.InferOutput<typeof TransactionPayloadSchema>

export const UpsertTransactionSchema = v.object({
  txId: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
  chainId: v.number(),
  hash: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(128)))),
  status: TransactionStatusSchema,
  operation: v.optional(v.nullable(TransactionOperationSchema)),
  name: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(1024)))),
  payload: v.optional(v.nullable(TransactionPayloadSchema)),
})
export type UpsertTransaction = v.InferOutput<typeof UpsertTransactionSchema>

/**
 * Narrow a loosely-typed operation string (the transaction manager types
 * `operation` as `string`) to the supported picklist, or `undefined` when it
 * is not a known operation. Keeps valibot the only place that knows the set.
 */
export function parseTransactionOperation(
  value: string | null | undefined,
): TransactionOperation | undefined {
  if (value == null) return undefined
  const result = v.safeParse(TransactionOperationSchema, value)
  return result.success ? result.output : undefined
}
