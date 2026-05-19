import { ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { UnsupportedNameTypeError } from '@ensdomains/ensjs'
import { err, fromPromise, ok } from 'neverthrow'
import { type Address, type ReadContractErrorType, zeroAddress } from 'viem'
import { readContract } from 'viem/actions'
import { getTokenMetadataWithAddress } from '@/features/register/utils/tokenLookup'
import { ethRegistrarRentPriceAbi } from '@/lib/abis/ethRegistrar'
import { SUPPORTED_TOKENS } from '@/lib/constants/tokens'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { getLabel } from '@/utils/token/getLabel'
import type { SupportedTokenAddresses } from '../types/tokens'

const ethRegistrar = ENS_SEPOLIA_CONTRACTS.ETHRegistrar

export class GetRegistrationPriceError extends TaggedError(
  'GetRegistrationPriceError',
)<{
  readonly cause: ReadContractErrorType | UnsupportedNameTypeError
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

// The currently-deployed V2 ETHRegistrar exposes a single `rentPrice` that
// returns (base, premium). Registration pays both; renewals pay base only
// (renewals are exempt from premium by design). When the post-audit refactor
// (PR #286) ships separate getRegisterPrice/getRenewPrice on-chain, switch
// the call sites to those — see ABIs in lib/abis/ethRegistrar.ts.
const getNamePrice = (mode: PriceMode) =>
  ResultFn(async function* ({
    name,
    duration,
    token,
    owner,
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

    const decimals = getTokenMetadataWithAddress(resolvedToken).decimals

    const [base, premium] = yield* fromPromise(
      readContract(client, {
        address: ethRegistrar,
        abi: ethRegistrarRentPriceAbi,
        functionName: 'rentPrice',
        args: [
          label,
          owner ?? zeroAddress,
          BigInt(duration),
          resolvedToken,
        ] as const,
      }),
      (e) =>
        new GetRegistrationPriceError({ cause: e as ReadContractErrorType }),
    )

    if (mode === 'renew') {
      return ok<RegistrationPriceResult>({
        base,
        premium: 0n,
        total: base,
        decimals,
        hasPremium: false,
      })
    }

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
