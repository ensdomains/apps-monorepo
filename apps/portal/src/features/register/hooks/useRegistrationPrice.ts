import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { l2EthRegistrarRentPriceSnippet } from '@ensdomains/ensjs/contracts'
import { fromPromise, ok } from 'neverthrow'
import { formatUnits, zeroAddress } from 'viem'
import { readContract } from 'viem/actions'
import {
  fastTestETHRegistrar,
  SUPPORTED_TOKENS,
} from '@/lib/constants/registry'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { formatUsdCeil } from '@/utils/formatting/formatUsdCeil'

class GetRegistrationPriceError extends TaggedError(
  'GetRegistrationPriceError',
)<{
  cause: unknown
}> {}

export type RegistrationPriceParameters = {
  readonly name: string
  readonly durationYears: number
}

export type RegistrationPriceResult = {
  readonly base: bigint
  readonly premium: bigint
  readonly total: bigint
  readonly baseFormatted: string
  readonly premiumFormatted: string
  readonly totalFormatted: string
}

const USDC_DECIMALS = 6

export const getRegistrationPrice = ResultFn(async function* ({
  name,
  durationYears,
}: RegistrationPriceParameters) {
  const client = yield* safeGetClient()

  const cleanName = name.replace(/\.eth$/i, '')
  const oneYearSeconds = BigInt(365 * 24 * 60 * 60)
  const years = Math.max(1, Math.floor(durationYears))

  const [base1yr, premium1yr] = yield* fromPromise(
    readContract(client, {
      address: fastTestETHRegistrar,
      abi: l2EthRegistrarRentPriceSnippet,
      functionName: 'rentPrice',
      args: [cleanName, zeroAddress, oneYearSeconds, SUPPORTED_TOKENS.USDC],
    }),
    (e) => new GetRegistrationPriceError({ cause: e }),
  )

  const base = base1yr * BigInt(years)
  const premium = premium1yr * BigInt(years)
  const total = base + premium

  return ok<RegistrationPriceResult>({
    base,
    premium,
    total,
    baseFormatted: formatUsdCeil(formatUnits(base, USDC_DECIMALS)),
    premiumFormatted: formatUsdCeil(formatUnits(premium, USDC_DECIMALS)),
    totalFormatted: formatUsdCeil(formatUnits(total, USDC_DECIMALS)),
  })
})

const getRegistrationPriceQueryKey = createQueryKey<
  'get-registration-price',
  RegistrationPriceParameters
>('get-registration-price')

export const getRegistrationPriceQueryOptions = (
  params: RegistrationPriceParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistrationPriceQueryKey(params),
    queryFn: () => getRegistrationPrice(params),
  })
