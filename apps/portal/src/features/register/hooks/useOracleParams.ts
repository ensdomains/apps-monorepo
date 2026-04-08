import { STANDARD_RENT_PRICE_ORACLE_ABI } from '@ens-apps/transaction-manager/abis/StandardRentPriceOracle.abi.js'
import { ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise, ok } from 'neverthrow'
import type { ReadContractErrorType } from 'viem'
import { readContract } from 'viem/actions'
import type { PremiumDecayConfig } from '@/features/register/utils/premiumDecay'
import type { OracleDiscountPoint } from '@/features/register/utils/registrationDiscount'
import { CONTRACT_SECONDS_PER_YEAR } from '@/lib/constants/duration'
import { safeGetNamechainSepoliaClient } from '@/lib/wagmi/helpers'

/**
 * Scaling factor used by the StandardRentPriceOracle for base-unit pricing.
 * All oracle base-unit values are divided by 10^PRICE_DECIMALS to get USD.
 *
 * @see contracts-v2/contracts/deploy/02_StandardRentPriceOracle.ts
 */
const PRICE_DECIMALS = 12

/** type(uint128).max — used to normalise oracle discount point values to [0, 1]. */
const DISCOUNT_SCALE = (1n << 128n) - 1n

export class GetOracleParamsError extends TaggedError('GetOracleParamsError')<{
  readonly cause: ReadContractErrorType
}> {}

export type OracleParams = {
  /**
   * Per-year USD price indexed by label length (0-indexed: index 0 = 1-char label).
   * Labels longer than the array use the last entry.
   */
  readonly baseRatesUsd: number[]
  /** Piecewise-linear discount schedule from the oracle. */
  readonly discountPoints: OracleDiscountPoint[]
  /** Premium decay configuration for recently expired names. */
  readonly premiumDecay: PremiumDecayConfig
}

const getOracleParamsQueryKey = createQueryKey<'get-oracle-params', object>(
  'get-oracle-params',
)

export const getOracleParamsQueryOptions = resultQueryOptions({
  queryKey: getOracleParamsQueryKey({}),
  // Oracle params change only via owner governance actions; cache indefinitely.
  staleTime: Number.POSITIVE_INFINITY,
  queryFn: () => getOracleParams(),
})

export const getOracleParams = ResultFn(async function* () {
  const client = yield* safeGetNamechainSepoliaClient()

  const [
    baseRates,
    rawDiscountPoints,
    premiumPriceInitial,
    premiumHalvingPeriod,
    premiumPeriod,
  ] = yield* fromPromise(
    Promise.all([
      readContract(client, {
        address: ENS_SEPOLIA_CONTRACTS.StandardRentPriceOracle,
        abi: STANDARD_RENT_PRICE_ORACLE_ABI,
        functionName: 'getBaseRates',
      }),
      readContract(client, {
        address: ENS_SEPOLIA_CONTRACTS.StandardRentPriceOracle,
        abi: STANDARD_RENT_PRICE_ORACLE_ABI,
        functionName: 'getDiscountPoints',
      }),
      readContract(client, {
        address: ENS_SEPOLIA_CONTRACTS.StandardRentPriceOracle,
        abi: STANDARD_RENT_PRICE_ORACLE_ABI,
        functionName: 'premiumPriceInitial',
      }),
      readContract(client, {
        address: ENS_SEPOLIA_CONTRACTS.StandardRentPriceOracle,
        abi: STANDARD_RENT_PRICE_ORACLE_ABI,
        functionName: 'premiumHalvingPeriod',
      }),
      readContract(client, {
        address: ENS_SEPOLIA_CONTRACTS.StandardRentPriceOracle,
        abi: STANDARD_RENT_PRICE_ORACLE_ABI,
        functionName: 'premiumPeriod',
      }),
    ]),
    (e) => new GetOracleParamsError({ cause: e as ReadContractErrorType }),
  )

  // Convert per-second base-unit rates → USD per year.
  const baseRatesUsd = Array.from(
    baseRates,
    (rate) =>
      Number(rate * BigInt(CONTRACT_SECONDS_PER_YEAR)) / 10 ** PRICE_DECIMALS,
  )

  // Convert oracle discount points from (uint64 t, uint128 value/DISCOUNT_SCALE)
  // to the [seconds, rate] format used by registrationDiscount.ts.
  const discountPoints: OracleDiscountPoint[] = rawDiscountPoints.map((p) => [
    Number(p.t),
    // Integer division with 5 decimal places avoids floating-point loss
    // when dividing large BigInts.
    Number((p.value * 100000n) / DISCOUNT_SCALE) / 100000,
  ])

  const premiumDecay: PremiumDecayConfig = {
    startPriceUsd: Number(premiumPriceInitial) / 10 ** PRICE_DECIMALS,
    halvingPeriodMs: Number(premiumHalvingPeriod) * 1000,
    periodMs: Number(premiumPeriod) * 1000,
  }

  return ok<OracleParams>({ baseRatesUsd, discountPoints, premiumDecay })
})
