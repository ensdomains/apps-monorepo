import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { UnsupportedNameTypeError } from '@ensdomains/ensjs'
import { type GetPriceErrorType, getPrice } from '@ensdomains/ensjs/public'
import { err, fromPromise, ok } from 'neverthrow'
import { getTokenMetadataWithAddress } from '@/features/register/utils/tokenLookup'
import { SUPPORTED_TOKENS } from '@/lib/constants/tokens'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { getLabel } from '@/utils/token/getLabel'
import type { SupportedTokenAddresses } from '../types/tokens'

export class GetRegistrationPriceError extends TaggedError(
  'GetRegistrationPriceError',
)<{
  readonly cause: GetPriceErrorType | UnsupportedNameTypeError
}> {}

export type RegistrationPriceParameters = {
  readonly name: string
  readonly duration: number
  readonly token?: SupportedTokenAddresses
}

export type RegistrationPriceResult = {
  readonly base: bigint
  readonly premium: bigint
  readonly total: bigint
  readonly decimals: number
  readonly hasPremium: boolean
}

export const getRegistrationPrice = ResultFn(async function* ({
  name,
  duration,
  token,
}: RegistrationPriceParameters) {
  const client = yield* safeGetClient()
  const resolvedToken = token ?? SUPPORTED_TOKENS.USDC

  let label: string

  try {
    label = getLabel(name)
  } catch (e) {
    return err(
      new GetRegistrationPriceError({ cause: e as UnsupportedNameTypeError }),
    )
  }

  // NOTE: `safeGetClient` returns a Wagmi `Client` that is structurally equivalent
  // to the public-client argument expected by `getPrice`, but ENSJS and this app
  // have not yet fully aligned their public client types. This cast keeps pricing
  // operational today at the cost of skipping strict compile-time validation for this
  // specific interoperability boundary. Remove this when type definitions are
  // standardized across both sides.
  const priceClient = client as unknown as Parameters<typeof getPrice>[0]

  const { base, premium } = yield* fromPromise(
    getPrice(priceClient, {
      nameOrNames: label,
      duration: BigInt(duration),
      paymentToken: resolvedToken,
    }),
    (e) => new GetRegistrationPriceError({ cause: e as GetPriceErrorType }),
  )

  const total = base + premium
  const decimals = getTokenMetadataWithAddress(resolvedToken).decimals

  return ok<RegistrationPriceResult>({
    base,
    premium,
    total,
    decimals,
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
