import { STANDARD_RENT_PRICE_ORACLE_ABI } from '@ens-apps/transaction-manager/contracts/abis/StandardRentPriceOracle.abi'
import { ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { useQuery } from '@tanstack/react-query'
import { useConfig } from 'wagmi'
import { readContractsQueryOptions } from 'wagmi/query'

/**
 * Multicalls `integratedDiscount(duration)` on the StandardRentPriceOracle for
 * each duration. Result indexes match the input array; failed calls surface as
 * `undefined` so a single revert doesn't blank out the rest of the chips. The
 * oracle's discount curve is static config — cache forever.
 */
export const useIntegratedDiscounts = (durationsSeconds: readonly number[]) => {
  const config = useConfig()

  return useQuery({
    ...readContractsQueryOptions(config, {
      allowFailure: true,
      contracts: durationsSeconds.map((duration) => ({
        address: ENS_SEPOLIA_CONTRACTS.StandardRentPriceOracle,
        abi: STANDARD_RENT_PRICE_ORACLE_ABI,
        functionName: 'integratedDiscount',
        args: [BigInt(duration)],
      })),
    }),
    staleTime: Number.POSITIVE_INFINITY,
    select: (data) =>
      data.map((entry) =>
        entry.status === 'success' ? entry.result : undefined,
      ),
  })
}
