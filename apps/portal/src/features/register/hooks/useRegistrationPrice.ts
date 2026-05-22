import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { UnsupportedNameTypeError } from '@ensdomains/ensjs'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  type GetPriceErrorType,
  type GetRenewPriceErrorType,
  getPrice,
  getRenewPrice,
} from '@ensdomains/ensjs/public/v2'
import { err, fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
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
  readonly cause: GetPriceErrorType | GetRenewPriceErrorType
}> {}

type PriceMode = 'register' | 'renew'

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

// Pricing is delegated to ensjs (`@ensdomains/ensjs/public/v2`):
// `getRegisterPrice` returns (base, premium) and pays both; `getRenewPrice`
// returns a single amount (renewals are premium-exempt). Both are state-aware
// and revert if the name isn't registerable/renewable. The registrar address is
// passed in (caller-provided) since it's a per-deployment value.
const getNamePrice = (mode: PriceMode) =>
  ResultFn(async function* ({
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
        new GetRegistrationPriceError({
          cause: e as UnsupportedNameTypeError,
        }),
      )
    }

    // ensjs requires a full eth-2ld name; reconstruct from the normalized label.
    const ethName = `${label}.eth`
    const decimals = getTokenMetadataWithAddress(resolvedToken).decimals

    if (mode === 'renew') {
      const base = yield* fromPromise(
        getRenewPrice(client, {
          registrarAddress: ethRegistrar,
          name: ethName,
          duration,
          paymentToken: resolvedToken,
        }),
        (e) =>
          new GetRegistrationPriceError({ cause: e as GetRenewPriceErrorType }),
      )

      return ok<RegistrationPriceResult>({
        base,
        premium: 0n,
        total: base,
        decimals,
        hasPremium: false,
      })
    }

    const { base, premium } = yield* fromPromise(
      getPrice(client, {
        registrarAddress: ethRegistrar,
        nameOrNames: ethName,
        duration,
        paymentToken: resolvedToken,
      }),
      (e) =>
        new GetRegistrationPriceError({
          cause: e as GetPriceErrorType,
        }),
    )

    return ok<RegistrationPriceResult>({
      base,
      premium,
      total: base + premium,
      decimals,
      hasPremium: premium > 0n,
    })
  })

export const getRegistrationPrice = getNamePrice('register')
export const getRenewalPrice = getNamePrice('renew')

const getRegistrationPriceQueryKey = createQueryKey<
  'get-registration-price',
  RegistrationPriceParameters
>('get-registration-price')

const getRenewalPriceQueryKey = createQueryKey<
  'get-renewal-price',
  RegistrationPriceParameters
>('get-renewal-price')

export const getRegistrationPriceQueryOptions = (
  params: RegistrationPriceParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistrationPriceQueryKey(params),
    queryFn: () => getRegistrationPrice(params),
  })

export const getRenewalPriceQueryOptions = (
  params: RegistrationPriceParameters,
) =>
  resultQueryOptions({
    queryKey: getRenewalPriceQueryKey(params),
    queryFn: () => getRenewalPrice(params),
  })
