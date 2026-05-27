import { applyDiscount } from '@ensdomains/ensjs/public/v2'
import { queryOptions, useQueries } from '@tanstack/react-query'
import type { Client, Transport } from 'viem'
import { type sepoliaWithEns, wagmiConfig } from '@/lib/wagmi'

export type DiscountInput = {
  /** Undiscounted value (e.g. baseRate × duration), in oracle units. */
  readonly value: bigint
  /** Term length, in seconds — selects the discount tier. */
  readonly duration: number
}

/**
 * Query options for a single `applyDiscount` call. Defined per-input so callers
 * can `useQueries` over many lookups — when one input changes, only that query
 * refetches. Calls are still JSON-RPC batched by the wagmi transport; the
 * discount curve is static config — cache forever.
 */
export const getAppliedDiscountQueryOptions = ({
  value,
  duration,
}: DiscountInput) =>
  queryOptions({
    queryKey: ['applied-discount', `${value}:${duration}`] as const,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: () =>
      applyDiscount(
        wagmiConfig.getClient() as Client<Transport, typeof sepoliaWithEns>,
        { value, duration: BigInt(duration) },
      ),
  })

/**
 * Applies the oracle's duration-tiered discount to each input via ensjs
 * `applyDiscount`. Returns one bigint per input (aligned by index); each entry
 * is `undefined` until its query resolves.
 */
export const useAppliedDiscounts = (inputs: readonly DiscountInput[]) =>
  useQueries({
    queries: inputs.map(getAppliedDiscountQueryOptions),
    combine: (results) => ({
      data: results.map((r) => r.data),
      isPending: results.some((r) => r.isPending),
      isError: results.some((r) => r.isError),
    }),
  })
