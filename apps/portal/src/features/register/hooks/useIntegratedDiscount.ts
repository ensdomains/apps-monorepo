import { STANDARD_RENT_PRICE_ORACLE_ABI } from '@ens-apps/transaction-manager/contracts/abis/StandardRentPriceOracle.abi'
import { ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { useQuery } from '@tanstack/react-query'
import { useConfig } from 'wagmi'
import { readContractsQueryOptions } from 'wagmi/query'

/**
 * Multicalls `integratedDiscount(duration)` on the StandardRentPriceOracle for
 * each duration. Result indexes match the input array. The oracle's discount
 * curve is static config — cache forever.
 */
export const useIntegratedDiscounts = (durationsSeconds: readonly number[]) => {
  const config = useConfig()

  return useQuery({
    ...readContractsQueryOptions(config, {
      allowFailure: false,
      contracts: durationsSeconds.map((duration) => ({
        address: ENS_SEPOLIA_CONTRACTS.StandardRentPriceOracle,
        abi: STANDARD_RENT_PRICE_ORACLE_ABI,
        functionName: 'integratedDiscount' as const,
        args: [BigInt(duration)] as const,
      })),
    }),
    staleTime: Number.POSITIVE_INFINITY,
  })
}
