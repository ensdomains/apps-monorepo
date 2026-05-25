import { STANDARD_RENT_PRICE_ORACLE_ABI } from '@ens-apps/transaction-manager/abis/StandardRentPriceOracle.abi.js'
import { ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise, ok } from 'neverthrow'
import type { MulticallErrorType } from 'viem'
import { publicClient } from '@/lib/wagmi'
import { ORACLE_PRICE_DECIMALS } from '../../workflow/pricing/lib/oracle'
import type { PremiumDecayConfig } from '../../workflow/pricing/lib/premiumDecay'

export class GetOracleParamsError extends TaggedError('GetOracleParamsError')<{
  readonly cause: MulticallErrorType
}> {}

export type OracleParams = {
  readonly premiumDecay: PremiumDecayConfig
}

export const getOracleParams = ResultFn(async function* () {
  const [premiumPriceInitial, premiumHalvingPeriod, premiumPeriod] =
    yield* fromPromise(
      publicClient.multicall({
        allowFailure: false,
        contracts: [
          {
            address: ENS_SEPOLIA_CONTRACTS.StandardRentPriceOracle,
            abi: STANDARD_RENT_PRICE_ORACLE_ABI,
            functionName: 'premiumPriceInitial',
          },
          {
            address: ENS_SEPOLIA_CONTRACTS.StandardRentPriceOracle,
            abi: STANDARD_RENT_PRICE_ORACLE_ABI,
            functionName: 'premiumHalvingPeriod',
          },
          {
            address: ENS_SEPOLIA_CONTRACTS.StandardRentPriceOracle,
            abi: STANDARD_RENT_PRICE_ORACLE_ABI,
            functionName: 'premiumPeriod',
          },
        ],
      }),
      (e) => new GetOracleParamsError({ cause: e as MulticallErrorType }),
    )

  const premiumDecay: PremiumDecayConfig = {
    startPriceUsd: Number(
      premiumPriceInitial / 10n ** BigInt(ORACLE_PRICE_DECIMALS),
    ),
    halvingPeriodMs: Number(premiumHalvingPeriod) * 1000,
    periodMs: Number(premiumPeriod) * 1000,
  }

  return ok<OracleParams>({ premiumDecay })
})

export const getOracleParamsQueryOptions = resultQueryOptions({
  queryKey: $qk({
    $service: 'standard-rent-price-oracle',
    $action: 'get-oracle-params',
  }),
  staleTime: Number.POSITIVE_INFINITY,
  queryFn: () => getOracleParams(),
})
