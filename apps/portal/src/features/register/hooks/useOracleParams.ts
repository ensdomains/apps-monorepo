import { STANDARD_RENT_PRICE_ORACLE_ABI } from '@ens-apps/transaction-manager/contracts/abis/StandardRentPriceOracle.abi'
import { ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise, ok } from 'neverthrow'
import type { MulticallErrorType } from 'viem'
import { multicall } from 'viem/actions'
import type { PremiumDecayConfig } from '@/features/register/utils/premiumDecay'
import { safeGetClient } from '@/lib/wagmi/helpers'

export class GetOracleParamsError extends TaggedError('GetOracleParamsError')<{
  readonly cause: MulticallErrorType
}> {}

export type OracleParams = {
  readonly premiumDecay: PremiumDecayConfig
}

const getOracleParamsQueryKey = createQueryKey<'get-oracle-params', object>(
  'get-oracle-params',
)

export const getOracleParamsQueryOptions = resultQueryOptions({
  queryKey: getOracleParamsQueryKey({}),
  staleTime: Number.POSITIVE_INFINITY,
  queryFn: () => getOracleParams(),
})

const PRICE_DECIMALS = 12

export const getOracleParams = ResultFn(async function* () {
  const client = yield* safeGetClient()

  const [premiumPriceInitial, premiumHalvingPeriod, premiumPeriod] =
    yield* fromPromise(
      multicall(client, {
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
    startPriceUsd: Number(premiumPriceInitial / 10n ** BigInt(PRICE_DECIMALS)),
    halvingPeriodMs: Number(premiumHalvingPeriod) * 1000,
    periodMs: Number(premiumPeriod) * 1000,
  }

  return ok<OracleParams>({ premiumDecay })
})
