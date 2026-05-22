import { ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { applyDiscount } from '@ensdomains/ensjs/public/v2'
import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'

export type DiscountInput = {
  /** Undiscounted value (e.g. baseRate × duration), in oracle units. */
  readonly value: bigint
  /** Term length, in seconds — selects the discount tier. */
  readonly duration: number
}

/**
 * Applies the oracle's duration-tiered discount to each input via ensjs
 * `applyDiscount`, returning the discounted values (indexes match the input
 * array). The oracle uses a step-function keyed on duration (replaces the
 * pre-audit `integratedDiscount`); doing it on-chain keeps us agnostic to the
 * contract's `DISCOUNT_DENOMINATOR`. Calls are JSON-RPC batched by the wagmi
 * transport; the discount curve is static config — cache forever.
 */
export const useAppliedDiscounts = (inputs: readonly DiscountInput[]) => {
  const publicClient = usePublicClient()

  return useQuery({
    queryKey: [
      'applied-discounts',
      inputs.map(({ value, duration }) => `${value}:${duration}`),
    ],
    enabled: !!publicClient,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      if (!publicClient) throw new Error('No public client')
      return Promise.all(
        inputs.map(({ value, duration }) =>
          applyDiscount(publicClient, {
            oracleAddress: ENS_SEPOLIA_CONTRACTS.StandardRentPriceOracle,
            value,
            duration,
          }),
        ),
      )
    },
  })
}
