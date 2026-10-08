import type { AnyVariables, DocumentInput } from '@urql/core'
import { type Hex, isHex } from 'viem'
import { graphqlIndexerClient } from '@/lib/indexer'

/** How long one indexer request may take before the read fails. */
export const INDEXED_ROLES_TIMEOUT_MS = 8_000

/** Resolves to `null` when the indexer has not answered in time. */
export const requestIndexedRoles = <TData>(
  query: DocumentInput<TData, AnyVariables>,
  variables: AnyVariables,
): Promise<TData | null> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), INDEXED_ROLES_TIMEOUT_MS)
  })

  return Promise.race([
    graphqlIndexerClient.request<TData>(query, variables),
    timeout,
  ]).finally(() => clearTimeout(timer))
}

// Rows are JSON from the indexer and are not trusted as typed. Each field is
// checked and converted, so a block number or timestamp never exists as a
// `number` past this point, and a malformed row fails the read.
export const asRecord = (
  value: unknown,
  name: string,
): Record<string, unknown> => {
  if (value !== null && typeof value === 'object') {
    return value as Record<string, unknown>
  }
  throw new Error(`Indexed role row: ${name} is not an object`)
}

export const asHex = (value: unknown, name: string): Hex => {
  if (typeof value === 'string' && isHex(value)) return value
  throw new Error(`Indexed role row: ${name} is not hex`)
}

export const asBigInt = (value: unknown, name: string): bigint => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value)
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value)
  throw new Error(`Indexed role row: ${name} is not an integer`)
}
