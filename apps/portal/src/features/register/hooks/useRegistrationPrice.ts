import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { l2EthRegistrarRentPriceSnippet } from '@ensdomains/ensjs/contracts'
import { fromPromise, ok } from 'neverthrow'
import { formatUnits, zeroAddress } from 'viem'
import { readContract } from 'viem/actions'
import { fastTestETHRegistrar, usdcSepolia } from '@/lib/constants/registry'
import { safeGetClient } from '@/lib/wagmi/helpers'

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60

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
  readonly paymentToken: string
  readonly decimals: number
}

const USDC_DECIMALS = 6

const formatUsdCeil = (value: string): string => {
  const num = Number.parseFloat(value)
  if (!Number.isFinite(num)) return '—'
  return Math.ceil(num).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

/**
 * Fetches registration price from FastTestETHRegistrar.
 * Uses same logic as manager: fetches 1-year price, multiplies by duration.
 * This matches manager app pricing (365 days per year, no multi-year discount).
 */
export const getRegistrationPrice = ResultFn(async function* ({
  name,
  durationYears,
}: RegistrationPriceParameters) {
  const client = yield* safeGetClient()

  const cleanName = name.replace(/\.eth$/i, '')
  const oneYearSeconds = BigInt(SECONDS_PER_YEAR)

  const [base1yr, premium1yr] = yield* fromPromise(
    readContract(client, {
      address: fastTestETHRegistrar,
      abi: l2EthRegistrarRentPriceSnippet,
      functionName: 'rentPrice',
      args: [cleanName, zeroAddress, oneYearSeconds, usdcSepolia],
    }),
    (e) => new GetRegistrationPriceError({ cause: e }),
  )

  const years = Math.max(1, Math.floor(durationYears))
  const base = base1yr * BigInt(years)
  const premium = premium1yr * BigInt(years)
  const total = base + premium

  const totalFormattedStr = formatUnits(total, USDC_DECIMALS)
  const baseFormattedStr = formatUnits(base, USDC_DECIMALS)
  const premiumFormattedStr = formatUnits(premium, USDC_DECIMALS)

  return ok<RegistrationPriceResult>({
    base,
    premium,
    total,
    baseFormatted: formatUsdCeil(baseFormattedStr),
    premiumFormatted: formatUsdCeil(premiumFormattedStr),
    totalFormatted: formatUsdCeil(totalFormattedStr),
    paymentToken: 'USDC',
    decimals: USDC_DECIMALS,
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
