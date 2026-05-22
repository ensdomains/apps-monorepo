import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { getPremiumDecayParams } from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import type { MulticallErrorType } from 'viem'
import type { PremiumDecayConfig } from '@/features/register/utils/premiumDecay'
import { ORACLE_PRICE_DECIMALS } from '@/lib/constants/oracle'
import { sepoliaWithEns } from '@/lib/wagmi'
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

export const getOracleParams = ResultFn(async function* () {
  const client = yield* safeGetClient()

  const { priceInitial, halvingPeriod, period } = yield* fromPromise(
    getPremiumDecayParams(client, {
      oracleAddress: getChainContractAddress({
        chain: sepoliaWithEns,
        contract: 'ensStandardRentPriceOracle',
      }),
    }),
    (e) => new GetOracleParamsError({ cause: e as MulticallErrorType }),
  )

  const premiumDecay: PremiumDecayConfig = {
    startPriceUsd: Number(priceInitial / 10n ** BigInt(ORACLE_PRICE_DECIMALS)),
    halvingPeriodMs: Number(halvingPeriod) * 1000,
    periodMs: Number(period) * 1000,
  }

  return ok<OracleParams>({ premiumDecay })
})
