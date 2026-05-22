import { STANDARD_RENT_PRICE_ORACLE_ABI } from '@ens-apps/transaction-manager/contracts/abis/StandardRentPriceOracle.abi'
import { ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { useQuery } from '@tanstack/react-query'
import { useConfig } from 'wagmi'
import { readContractsQueryOptions } from 'wagmi/query'

export type DiscountInput = {
  /** Undiscounted value (e.g. baseRate × duration), in oracle units. */
  readonly value: bigint
  /** Term length, in seconds — selects the discount tier. */
  readonly duration: number
}

/**
 * Multicalls `applyDiscount(value, duration)` on the post-audit
 * StandardRentPriceOracle for each input, returning the discounted value. The
 * oracle applies a step-function discount keyed on duration (replaces the
 * pre-audit `integratedDiscount`); doing it on-chain keeps us agnostic to the
 * contract's `DISCOUNT_DENOMINATOR`. Result indexes match the input array; the
 * discount curve is static config — cache forever.
 */
export const useAppliedDiscounts = (inputs: readonly DiscountInput[]) => {
  const config = useConfig()

  return useQuery({
    ...readContractsQueryOptions(config, {
      allowFailure: false,
      contracts: inputs.map(({ value, duration }) => ({
        address: ENS_SEPOLIA_CONTRACTS.StandardRentPriceOracle,
        abi: STANDARD_RENT_PRICE_ORACLE_ABI,
        functionName: 'applyDiscount' as const,
        args: [value, BigInt(duration)] as const,
      })),
    }),
    staleTime: Number.POSITIVE_INFINITY,
  })
}
