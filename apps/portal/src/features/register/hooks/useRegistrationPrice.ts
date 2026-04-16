import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { UnsupportedNameTypeError } from '@ensdomains/ensjs'
import { type GetPriceErrorType, getPrice } from '@ensdomains/ensjs/public/v2'
import { err, fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { getTokenMetadataWithAddress } from '@/features/register/utils/tokenLookup'
import { fastTestETHRegistrar } from '@/lib/constants/registry'
import { SUPPORTED_TOKENS } from '@/lib/constants/tokens'
import { safeGetNamechainSepoliaClient } from '@/lib/wagmi/helpers'
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
  readonly owner?: Address
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
  owner,
}: RegistrationPriceParameters) {
  const client = yield* safeGetNamechainSepoliaClient()
  const resolvedToken = token ?? SUPPORTED_TOKENS.USDC

  let label: string

  try {
    label = getLabel(name)
  } catch (e) {
    return err(
      new GetRegistrationPriceError({ cause: e as UnsupportedNameTypeError }),
    )
  }

  // The StandardRentPriceOracle skips the temporary premium when owner is
  // address(0) (the ensjs default). Passing the user's address ensures the
  // returned price includes any active premium for recently expired names.
  const { base, premium } = yield* fromPromise(
    getPrice(client, {
      nameOrNames: label,
      duration: BigInt(duration),
      paymentToken: resolvedToken,
      registrarAddress: fastTestETHRegistrar,
      owner,
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
