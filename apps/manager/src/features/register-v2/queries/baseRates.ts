import { STANDARD_RENT_PRICE_ORACLE_ABI } from '@ens-apps/transaction-manager/abis/StandardRentPriceOracle.abi.js'
import { ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import { fromPromise } from 'neverthrow'
import type { ReadContractErrorType } from 'viem'
import { readContract } from 'viem/actions'
import { publicClient } from '@/lib/wagmi'
import { getLabelLength } from '../utils/name-parser'

export class GetBaseRatesError extends TaggedError('GetBaseRatesError')<{
  readonly cause: ReadContractErrorType
}> {}

export const getBaseRates = () =>
  fromPromise(
    readContract(publicClient, {
      address: ENS_SEPOLIA_CONTRACTS.StandardRentPriceOracle,
      abi: STANDARD_RENT_PRICE_ORACLE_ABI,
      functionName: 'getBaseRates',
      args: [],
    }),
    (e) => new GetBaseRatesError({ cause: e as ReadContractErrorType }),
  )

export const getBaseRatesQueryOptions = resultQueryOptions({
  queryKey: $qk({
    $service: 'standard-rent-price-oracle',
    $action: 'get-base-rates',
  }),
  staleTime: Number.POSITIVE_INFINITY,
  queryFn: () => getBaseRates(),
})

export const useBaseRate = (label: string) => {
  const baseRates = useQuery(getBaseRatesQueryOptions)

  if (!baseRates.data) {
    return 0n
  }

  const labelLength = Math.min(getLabelLength(label), baseRates.data.length - 1)
  const baseRate = baseRates.data[labelLength]

  if (baseRate === undefined) {
    return 0n
  }

  return baseRate
}
