import { ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { UnsupportedNameTypeError } from '@ensdomains/ensjs'
import { err, fromPromise, ok } from 'neverthrow'
import { type Address, type ReadContractErrorType, zeroAddress } from 'viem'
import { readContract } from 'viem/actions'
import { getTokenMetadataWithAddress } from '@/features/register/utils/tokenLookup'
import { SUPPORTED_TOKENS } from '@/lib/constants/tokens'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { getLabel } from '@/utils/token/getLabel'
import type { SupportedTokenAddresses } from '../types/tokens'

const ethRegistrar = ENS_SEPOLIA_CONTRACTS.ETHRegistrar

/**
 * Minimal `rentPrice` fragment for the V2 ETHRegistrar / StandardRentPriceOracle.
 * Deploy-agnostic — keeps the price read free of any ensjs chain-config coupling.
 */
const ethRegistrarRentPriceAbi = [
  {
    type: 'function',
    name: 'rentPrice',
    stateMutability: 'view',
    inputs: [
      { name: 'label', type: 'string' },
      { name: 'owner', type: 'address' },
      { name: 'duration', type: 'uint64' },
      { name: 'paymentToken', type: 'address' },
    ],
    outputs: [
      { name: 'base', type: 'uint256' },
      { name: 'premium', type: 'uint256' },
    ],
  },
] as const

export class GetRegistrationPriceError extends TaggedError(
  'GetRegistrationPriceError',
)<{
  readonly cause: ReadContractErrorType | UnsupportedNameTypeError
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

  // The StandardRentPriceOracle skips the temporary premium when owner is
  // address(0). Passing the user's address ensures the returned price includes
  // any active premium for recently expired names.
  const [base, premium] = yield* fromPromise(
    readContract(client, {
      address: ethRegistrar,
      abi: ethRegistrarRentPriceAbi,
      functionName: 'rentPrice',
      args: [label, owner ?? zeroAddress, BigInt(duration), resolvedToken],
    }),
    (e) => new GetRegistrationPriceError({ cause: e as ReadContractErrorType }),
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
