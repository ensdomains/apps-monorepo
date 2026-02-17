import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { l2EthRegistrarRentPriceSnippet } from '@ensdomains/ensjs/contracts'
import { fromPromise, ok } from 'neverthrow'
import { formatUnits, zeroAddress } from 'viem'
import { readContract } from 'viem/actions'
import { fastTestETHRegistrar, usdcSepolia } from '@/lib/constants/registry'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { getDurationInSecondsFromYears } from '../utils/registrationDuration'

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

/** Formats a numeric string as USD, avoiding overflow for large numbers */
const formatUsd = (value: string): string => {
  const num = Number.parseFloat(value)
  if (!Number.isFinite(num)) return '—'
  return num.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Fetches registration price (base + premium) from FastTestETHRegistrar.
 * Uses USDC as the payment token.
 */
export const getRegistrationPrice = ResultFn(async function* ({
  name,
  durationYears,
}: RegistrationPriceParameters) {
  const client = yield* safeGetClient()

  const cleanName = name.replace(/\.eth$/i, '')
  const durationSeconds = BigInt(getDurationInSecondsFromYears(durationYears))

  const [base, premium] = yield* fromPromise(
    readContract(client, {
      address: fastTestETHRegistrar,
      abi: l2EthRegistrarRentPriceSnippet,
      functionName: 'rentPrice',
      args: [cleanName, zeroAddress, durationSeconds, usdcSepolia],
    }),
    (e) => new GetRegistrationPriceError({ cause: e }),
  )

  const total = base + premium

  return ok<RegistrationPriceResult>({
    base,
    premium,
    total,
    baseFormatted: formatUsd(formatUnits(base, USDC_DECIMALS)),
    premiumFormatted: formatUsd(formatUnits(premium, USDC_DECIMALS)),
    totalFormatted: formatUsd(formatUnits(total, USDC_DECIMALS)),
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
