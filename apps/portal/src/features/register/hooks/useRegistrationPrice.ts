import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { l2EthRegistrarRentPriceSnippet } from '@ensdomains/ensjs/contracts'
import { fromPromise, ok } from 'neverthrow'
import { formatUnits, zeroAddress } from 'viem'
import { readContract } from 'viem/actions'
import { fastTestETHRegistrar } from '@/lib/constants/registry'
import { SUPPORTED_TOKENS } from '@/lib/constants/tokens'
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
  readonly base: string
  readonly premium: string
  readonly total: string
  readonly hasPremium: boolean
}

const USDC_DECIMALS = 6

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60

export const getRegistrationPrice = ResultFn(async function* ({
  name,
  durationYears,
}: RegistrationPriceParameters) {
  const client = yield* safeGetClient()

  const years = Math.max(1, Math.floor(durationYears))
  const durationSeconds = years * ONE_YEAR_SECONDS
  const cleanName = name.replace(/\.eth$/i, '')

  const [base, premium] = yield* fromPromise(
    // TODO : replace this with ensjs `getPrice` function
    // temporarily using readContract to get the price since ensjs `getPrice` function throws contract mismatch errors
    readContract(client, {
      address: fastTestETHRegistrar,
      abi: l2EthRegistrarRentPriceSnippet,
      functionName: 'rentPrice',
      args: [
        cleanName,
        zeroAddress,
        BigInt(durationSeconds),
        SUPPORTED_TOKENS.USDC,
      ],
    }),
    (e) => new GetRegistrationPriceError({ cause: e }),
  )

  const total = base + premium

  return ok<RegistrationPriceResult>({
    base: formatUsdCeil(formatUnits(base, USDC_DECIMALS)),
    premium: formatUsdCeil(formatUnits(premium, USDC_DECIMALS)),
    total: formatUsdCeil(formatUnits(total, USDC_DECIMALS)),
    hasPremium: true ?? premium > 0n,
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
