import { STANDARD_RENT_PRICE_ORACLE_ABI } from '@ens-apps/transaction-manager/contracts/abis/StandardRentPriceOracle.abi'
import { ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise, ok } from 'neverthrow'
import type { MulticallErrorType } from 'viem'
import { multicall } from 'viem/actions'
import { integratedDiscountToPercent } from '@/features/register/utils/registrationPricing'
import { CONTRACT_SECONDS_PER_YEAR } from '@/lib/constants/duration'
import { safeGetNamechainSepoliaClient } from '@/lib/wagmi/helpers'

/** Preset registration durations shown in the duration picker. */
export const PRESET_YEARS = [1, 3, 5, 10] as const

export class GetPresetDiscountsError extends TaggedError(
  'GetPresetDiscountsError',
)<{
  readonly cause: MulticallErrorType
}> {}

/** Effective average discount percent keyed by registration years. */
export type PresetDiscounts = Record<(typeof PRESET_YEARS)[number], number>

const getPresetDiscountsQueryKey = createQueryKey<'preset-discounts', object>(
  'preset-discounts',
)

export const getPresetDiscountsQueryOptions = resultQueryOptions({
  queryKey: getPresetDiscountsQueryKey({}),
  // Discount schedule changes only via governance; cache indefinitely.
  staleTime: Number.POSITIVE_INFINITY,
  queryFn: () => getPresetDiscounts(),
})

export const getPresetDiscounts = ResultFn(async function* () {
  const client = yield* safeGetNamechainSepoliaClient()

  const results = yield* fromPromise(
    multicall(client, {
      allowFailure: false,
      contracts: PRESET_YEARS.map((years) => ({
        address: ENS_SEPOLIA_CONTRACTS.StandardRentPriceOracle,
        abi: STANDARD_RENT_PRICE_ORACLE_ABI,
        functionName: 'integratedDiscount' as const,
        args: [BigInt(years * CONTRACT_SECONDS_PER_YEAR)] as const,
      })),
    }),
    (e) => new GetPresetDiscountsError({ cause: e as MulticallErrorType }),
  )

  const discounts = Object.fromEntries(
    PRESET_YEARS.map((years, i) => [
      years,
      integratedDiscountToPercent(
        results[i],
        years * CONTRACT_SECONDS_PER_YEAR,
      ),
    ]),
  ) as PresetDiscounts

  return ok<PresetDiscounts>(discounts)
})
