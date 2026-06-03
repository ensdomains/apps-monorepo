import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { UnsupportedNameTypeError } from '@ensdomains/ensjs'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  type GetRegisterPriceErrorType,
  getRegisterPrice,
} from '@ensdomains/ensjs/public/v2'
import { err, fromPromise, ok } from 'neverthrow'
import { getTokenMetadataWithAddress } from '@/features/register/utils/tokenLookup'
import { SUPPORTED_TOKENS } from '@/lib/constants/tokens'
import { sepoliaWithEns } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { getLabel } from '@/utils/token/getLabel'
import type { SupportedTokenAddresses } from '../types/tokens'

const ethRegistrar = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensEthRegistrar',
})

export class GetRegistrationPriceError extends TaggedError(
  'GetRegistrationPriceError',
)<{
  readonly cause: GetRegisterPriceErrorType | UnsupportedNameTypeError
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

  // ENSv2 `ETHRegistrar.getRegisterPrice` derives the temporary premium from
  // on-chain state (time since `expiry + GRACE_PERIOD`) and returns it
  // unconditionally — no caller-supplied owner is needed to opt into premium
  // pricing, unlike the v1 oracle.
  const { base, premium } = yield* fromPromise(
    getRegisterPrice(client, {
      label,
      duration: BigInt(duration),
      paymentToken: resolvedToken,
      registrarAddress: ethRegistrar,
    }),
    (e) =>
      new GetRegistrationPriceError({ cause: e as GetRegisterPriceErrorType }),
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
