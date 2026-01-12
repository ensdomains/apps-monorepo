import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  getNameRegistries as ensjsGetNameRegistries,
  type GetNameRegistriesErrorType,
} from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import type { GetEnsOwnerError } from '@/features/profile/hooks/useEnsOwner'
import { l2RegistryFinderAddress } from '@/lib/constants/registry'
import {
  safeGetClient,
  safeGetNamechainSepoliaClient,
} from '@/lib/wagmi/helpers'
import type {
  EnsNetworkName,
  ProtocolVersion,
  WithEnsNetwork,
} from '@/utils/types'

type GetNameRegistriesParameters = WithEnsNetwork<{
  name: string
}>

type Root = [root: Address | null]
type TLD = [tld: Address, ...Root]
type TwoLD = [nameOrZero: Address, ...TLD]
type ThreeLD = [nameAddress: Address, ...TwoLD]

type NameRegistries = Root | TLD | TwoLD | ThreeLD

type NameRegistriesReturnType = {
  registries: NameRegistries
  network: EnsNetworkName
  protocolVersion: ProtocolVersion
} | null

class NameRegistriesError extends TaggedError('NameRegistriesError')<{
  cause: GetNameRegistriesErrorType | GetEnsOwnerError
}> {}

/**
 * Discovers which registry (L1 V1, L1 V2, or L2) a name exists on and returns all registry addresses.
 *
 * Checks in order:
 * 1. L2 V2 (Namechain) using ensjs getNameRegistries with RegistryFinder
 * 2. L1 V2 (Sepolia) using ensjs getNameRegistries with UniversalResolver
 * 3. L1 V1 (Sepolia) using getOwner with V1 ETHRegistry
 *
 * For V1 registries, all subnames live on the same registry.
 * For V2 registries, ensjs getNameRegistries efficiently fetches all registry addresses at once.
 */
const getNameRegistries = ResultFn(async function* ({
  network,
  name,
}: GetNameRegistriesParameters) {
  const l1Client = yield* safeGetClient()
  const l2Client = yield* safeGetNamechainSepoliaClient()

  if (!network) return ok(null)

  if (network === 'sepolia') {
    const registries = (yield* fromPromise(
      ensjsGetNameRegistries(l1Client, { name }),
      (e) =>
        new NameRegistriesError({ cause: e as GetNameRegistriesErrorType }),
    )) as NameRegistries
    return ok({
      registries,
      network: 'sepolia',
      protocolVersion: 'ENSv1',
    } as const satisfies NameRegistriesReturnType)
  } else if (network === 'namechainSepolia') {
    const registries = (yield* fromPromise(
      ensjsGetNameRegistries(l2Client, {
        name,
        address: l2RegistryFinderAddress,
      }),
      (e) =>
        new NameRegistriesError({ cause: e as GetNameRegistriesErrorType }),
    )) as NameRegistries
    return ok({
      registries,
      network: 'namechainSepolia',
      protocolVersion: 'ENSv2',
    } as const satisfies NameRegistriesReturnType)
  }
  return ok(null)
})

const nameRegistriesQueryKey = createQueryKey<
  'nameRegistries',
  GetNameRegistriesParameters
>('nameRegistries')

export const getNameRegistriesQueryOptions = (
  params: GetNameRegistriesParameters,
) =>
  resultQueryOptions({
    queryKey: nameRegistriesQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getNameRegistries(params),
  })
