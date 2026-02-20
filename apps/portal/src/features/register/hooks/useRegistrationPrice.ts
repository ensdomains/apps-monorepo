import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { l2EthRegistrarRentPriceSnippet } from '@ensdomains/ensjs/contracts'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { formatUnits, zeroAddress } from 'viem'
import { readContract } from 'viem/actions'
import { getTokenDecimals } from '@/features/register/utils/tokenDecimals'
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
  readonly duration: number
  readonly token?: Address
}

export type RegistrationPriceResult = {
  readonly base: string
  readonly premium: string
  readonly total: string
  readonly totalRaw: bigint
  readonly hasPremium: boolean
}

export const getRegistrationPrice = ResultFn(async function* ({
  name,
  duration,
  token,
}: RegistrationPriceParameters) {
  const client = yield* safeGetClient()
  const resolvedToken = token ?? SUPPORTED_TOKENS.USDC
  const cleanName = name.replace(/\.eth$/i, '')

  const [base, premium] = yield* fromPromise(
    // TODO : replace this with ensjs `getPrice` function
    // temporarily using readContract to get the price since ensjs `getPrice` function throws contract mismatch errors
    readContract(client, {
      address: fastTestETHRegistrar,
      abi: l2EthRegistrarRentPriceSnippet,
      functionName: 'rentPrice',
      args: [cleanName, zeroAddress, BigInt(duration), resolvedToken],
    }),
    (e) => new GetRegistrationPriceError({ cause: e }),
  )

  const total = base + premium
  const decimals = getTokenDecimals(resolvedToken)

  return ok<RegistrationPriceResult>({
    base: formatUsdCeil(formatUnits(base, decimals)),
    premium: formatUsdCeil(formatUnits(premium, decimals)),
    total: formatUsdCeil(formatUnits(total, decimals)),
    totalRaw: total,
    hasPremium: premium > 0n,
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
