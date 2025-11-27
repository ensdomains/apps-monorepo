import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { type GetOwnerErrorType, getOwner } from '@ensdomains/ensjs/public/v1'
import {
  type GetNameRegistriesErrorType,
  getNameRegistries,
} from '@ensdomains/ensjs/public/v2'
import { useQuery } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { zeroAddress } from 'viem'
import {
  namechainEthRegistryAddress,
  registryFinderAddress,
  sepoliaEthRegistryAddress,
} from '@/lib/constants/registry'
import {
  namechainVerifiableFactory,
  sepoliaVerifiableFactory,
} from '@/lib/constants/verifiableFactory'
import type { WagmiClientError } from '@/lib/wagmi/helpers'
import {
  safeGetClient,
  safeGetNamechainSepoliaClient,
} from '@/lib/wagmi/helpers'

export type GetNameRegistriesParameters = {
  name: string
}

export type NameRegistriesResult = {
  rootRegistry: Address
  currentRegistry: Address | null
  parentRegistry: Address | null
  registries: readonly Address[]
  hasCurrentRegistry: boolean
  network: 'sepolia' | 'namechainSepolia'
  protocolVersion: 'ENSv1' | 'ENSv2'
  factory: Address | null
}

export class NameRegistriesError extends TaggedError('NameRegistriesError')<{
  cause: GetNameRegistriesErrorType | GetOwnerErrorType
}> {}

export type RegistryDiscoveryError = NameRegistriesError | WagmiClientError

export type RegistryDiscoveryReturnType = {
  rootRegistry: Address | null
  currentRegistry: Address | null
  parentRegistry: Address | null
  subregistries: readonly Address[]
  hasCurrentRegistry: boolean
  network: 'sepolia' | 'namechainSepolia' | null
  protocolVersion: 'ENSv1' | 'ENSv2' | null
  factory: Address | null
  isLoading: boolean
  error: RegistryDiscoveryError | null
}

/**
 * Discovers which registry (L1 V1, L1 V2, or L2) a name exists on and returns all registry addresses.
 *
 * Checks in order:
 * 1. L2 V2 (Namechain) using getNameRegistries with RegistryFinder
 * 2. L1 V2 (Sepolia) using getNameRegistries with UniversalResolver
 * 3. L1 V1 (Sepolia) using getOwner with V1 ETHRegistry
 *
 * For V1 registries, all subnames live on the same registry.
 * For V2 registries, getNameRegistries efficiently fetches all registry addresses at once.
 */
export const getNameRegistriesForName = ResultFn(async function* (
  params: GetNameRegistriesParameters,
) {
  const { name } = params
  const l1Client = yield* safeGetClient()
  const l2Client = yield* safeGetNamechainSepoliaClient()

  const labels = name.split('.')
  if (labels.length < 2) {
    return ok<NameRegistriesResult>({
      rootRegistry: sepoliaEthRegistryAddress,
      currentRegistry: null,
      parentRegistry: null,
      registries: [],
      hasCurrentRegistry: false,
      network: 'sepolia',
      protocolVersion: 'ENSv2',
      factory: sepoliaVerifiableFactory,
    })
  }

  // Step 1: Check L2 V2 using getNameRegistries with RegistryFinder
  const l2Registries = yield* await fromPromise(
    getNameRegistries(l2Client, {
      name,
      address: registryFinderAddress,
    }),
    (e) => new NameRegistriesError({ cause: e as GetNameRegistriesErrorType }),
  )

  // If registries.at(-2) exists and is not zeroAddress, name exists on L2
  const l2SecondToLast = l2Registries.at(-2)
  if (l2SecondToLast && l2SecondToLast !== zeroAddress) {
    const currentRegistry = l2SecondToLast ?? null
    const parentRegistry = l2Registries.at(-3) ?? namechainEthRegistryAddress

    return ok<NameRegistriesResult>({
      rootRegistry: namechainEthRegistryAddress,
      currentRegistry,
      parentRegistry,
      registries: l2Registries,
      hasCurrentRegistry: !!currentRegistry && currentRegistry !== zeroAddress,
      network: 'namechainSepolia',
      protocolVersion: 'ENSv2',
      factory: namechainVerifiableFactory,
    })
  }

  // Step 2: Check L1 V2 using getNameRegistries with UniversalResolver
  const universalResolverAddress = getChainContractAddress({
    chain: l1Client.chain,
    contract: 'ensUniversalResolver',
  })

  const l1V2Registries = yield* await fromPromise(
    getNameRegistries(l1Client, {
      name,
      address: universalResolverAddress,
    }),
    (e) => new NameRegistriesError({ cause: e as GetNameRegistriesErrorType }),
  )

  // If registries.at(-2) exists and is not zeroAddress, name exists on L1 V2
  const l1V2SecondToLast = l1V2Registries.at(-2)
  if (l1V2SecondToLast && l1V2SecondToLast !== zeroAddress) {
    const currentRegistry = l1V2SecondToLast ?? null
    const parentRegistry = l1V2Registries.at(-3) ?? sepoliaEthRegistryAddress

    return ok<NameRegistriesResult>({
      rootRegistry: sepoliaEthRegistryAddress,
      currentRegistry,
      parentRegistry,
      registries: l1V2Registries,
      hasCurrentRegistry: !!currentRegistry && currentRegistry !== zeroAddress,
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
    const registries = pathLabels.map(() => v1RegistryAddress)

    return ok<NameRegistriesResult>({
      rootRegistry: v1RegistryAddress,
      currentRegistry: v1RegistryAddress,
      parentRegistry: v1RegistryAddress,
      registries,
      hasCurrentRegistry: true,
      network: 'sepolia',
      protocolVersion: 'ENSv1',
      factory: null, // V1 doesn't use verifiable factories
    })
  }

  // Name doesn't exist anywhere
  return ok<NameRegistriesResult>({
    rootRegistry: sepoliaEthRegistryAddress,
    currentRegistry: null,
    parentRegistry: null,
    registries: [],
    hasCurrentRegistry: false,
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
    queryFn: ({ queryKey: [, params] }) => getNameRegistriesForName(params),
  })

export function useNameRegistryDiscovery({
  name,
  enabled = true,
}: {
  name: string
  enabled?: boolean
}): RegistryDiscoveryReturnType {
  const query = useQuery({
    ...getNameRegistriesQueryOptions({ name }),
    enabled,
  })

  return {
    rootRegistry: query.data?.rootRegistry ?? null,
    currentRegistry: query.data?.currentRegistry ?? null,
    parentRegistry: query.data?.parentRegistry ?? null,
    subregistries: (query.data?.registries ?? []) as readonly Address[],
    hasCurrentRegistry: query.data?.hasCurrentRegistry ?? false,
    network: query.data?.network ?? null,
    protocolVersion: query.data?.protocolVersion ?? null,
    factory: query.data?.factory ?? null,
    isLoading: query.isLoading,
    error: query.error ?? null,
  }
}
