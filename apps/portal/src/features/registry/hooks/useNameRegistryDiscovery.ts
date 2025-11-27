import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { type GetOwnerErrorType, getOwner } from '@ensdomains/ensjs/public/v1'
import {
  getNameRegistries as ensjsGetNameRegistries,
  type GetNameRegistriesErrorType,
} from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { zeroAddress } from 'viem'
import { l2RegistryFinderAddress } from '@/lib/constants/registry'
import {
  namechainVerifiableFactory,
  sepoliaVerifiableFactory,
} from '@/lib/constants/verifiableFactory'
import type { WagmiClientError } from '@/lib/wagmi/helpers'
import {
  safeGetClient,
  safeGetNamechainSepoliaClient,
} from '@/lib/wagmi/helpers'
import type { EnsNetworkName, ProtocolVersion } from '@/utils/types'

export type GetNameRegistriesParameters = {
  name: string
}

/**
 * Result of resolving registries for a name.
 *
 * We rely on these invariants:
 * - `registries.at(-2)` is the registry for `name` (or undefined/zeroAddress if it doesn’t exist)
 * - `registries.at(-3)` is the registry for the parent of `name` (if any)
 *
 * For V2 this comes directly from ensjs `getNameRegistries`.
 * For V1 we synthesize the array so that the invariants still hold.
 */
export type NameRegistriesResult = {
  registries: readonly Address[]
  network: EnsNetworkName
  protocolVersion: ProtocolVersion
  factory: Address | null
}

export class NameRegistriesError extends TaggedError('NameRegistriesError')<{
  cause: GetNameRegistriesErrorType | GetOwnerErrorType
}> {}

export type NameRegistriesError_ = NameRegistriesError | WagmiClientError

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
export const getNameRegistries = ResultFn(async function* (
  params: GetNameRegistriesParameters,
) {
  const { name } = params
  const l1Client = yield* safeGetClient()
  const l2Client = yield* safeGetNamechainSepoliaClient()

  const labels = name.split('.')
  if (labels.length < 2) {
    return ok<NameRegistriesResult>({
      registries: [],
      network: 'sepolia',
      protocolVersion: 'ENSv2',
      factory: sepoliaVerifiableFactory,
    })
  }

  // Step 1: Check L2 V2 using ensjs getNameRegistries with RegistryFinder
  const l2Registries = yield* await fromPromise(
    ensjsGetNameRegistries(l2Client, {
      name,
      address: l2RegistryFinderAddress,
    }),
    (e) => new NameRegistriesError({ cause: e as GetNameRegistriesErrorType }),
  )

  // If registries.at(-2) exists and is not zeroAddress, name exists on L2
  const l2NameRegistry = l2Registries.at(-2)
  if (l2NameRegistry && l2NameRegistry !== zeroAddress) {
    return ok<NameRegistriesResult>({
      registries: l2Registries,
      network: 'namechainSepolia',
      protocolVersion: 'ENSv2',
      factory: namechainVerifiableFactory,
    })
  }

  // Step 2: Check L1 V2 using ensjs getNameRegistries with UniversalResolver
  const universalResolverAddress = getChainContractAddress({
    chain: l1Client.chain,
    contract: 'ensUniversalResolver',
  })

  const l1V2Registries = yield* await fromPromise(
    ensjsGetNameRegistries(l1Client, {
      name,
      address: universalResolverAddress,
    }),
    (e) => new NameRegistriesError({ cause: e as GetNameRegistriesErrorType }),
  )

  // If registries.at(-2) exists and is not zeroAddress, name exists on L1 V2
  const l1V2NameRegistry = l1V2Registries.at(-2)
  if (l1V2NameRegistry && l1V2NameRegistry !== zeroAddress) {
    return ok<NameRegistriesResult>({
      registries: l1V2Registries,
      network: 'sepolia',
      protocolVersion: 'ENSv2',
      factory: sepoliaVerifiableFactory,
    })
  }

  // Step 3: Check L1 V1 using getOwner
  const l1V1Owner = yield* await fromPromise(
    getOwner(l1Client, { name }),
    (e) => new NameRegistriesError({ cause: e as GetOwnerErrorType }),
  )

  // If owner exists, name is on V1 registry - all subnames share the same registry
  if (l1V1Owner?.owner && l1V1Owner.owner !== zeroAddress) {
    const v1RegistryAddress = getChainContractAddress({
      chain: l1Client.chain,
      contract: 'ensRegistry',
    })

    // For V1, all labels use the same registry address
    const pathLabels = labels.slice(0, -1) // Drop TLD
    const registries: readonly Address[] = pathLabels.map(
      () => v1RegistryAddress,
    )

    return ok<NameRegistriesResult>({
      registries,
      network: 'sepolia',
      protocolVersion: 'ENSv1',
      factory: null, // V1 doesn't use verifiable factories
    })
  }

  // Name doesn't exist anywhere
  return ok<NameRegistriesResult>({
    registries: [],
    network: 'sepolia',
    protocolVersion: 'ENSv2',
    factory: sepoliaVerifiableFactory,
  })
})

export const nameRegistriesQueryKey = createQueryKey<
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
