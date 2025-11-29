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
import {
  l2RegistryFinderAddress,
  sepoliaEthRegistryAddress,
} from '@/lib/constants/registry'
import {
  namechainVerifiableFactory,
  sepoliaVerifiableFactory,
} from '@/lib/constants/verifiableFactory'
import {
  safeGetClient,
  safeGetNamechainSepoliaClient,
} from '@/lib/wagmi/helpers'
import type { EnsNetworkName, ProtocolVersion } from '@/utils/types'

// Debug flag - set to true to enable console logs for registry discovery
const DEBUG_REGISTRY_DISCOVERY = false

const debug = (...args: unknown[]) => {
  if (DEBUG_REGISTRY_DISCOVERY) {
    console.log(...args)
  }
}

export type GetNameRegistriesParameters = {
  name: string
}

type NameRegistriesResultType =
  | [nameOrZero: Address, tld: Address] // Invalid or non-existent name
  | [nameAddress: Address, ethRegistry: Address, rootRegistry: Address] // 2LD: flo.eth
  | [
      subnameAddress: Address,
      nameAddress: Address,
      ethRegistry: Address,
      rootRegistry: Address,
    ] // 3LD: sub.flo.eth

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
  registries: NameRegistriesResultType
  network: EnsNetworkName
  protocolVersion: ProtocolVersion
  factory: Address | null
}

export class NameRegistriesError extends TaggedError('NameRegistriesError')<{
  cause: GetNameRegistriesErrorType | GetOwnerErrorType
}> {}

/**
 * Converts ensjs getNameRegistries result to our precise tuple type.
 *
 * ensjs returns:
 * - flo.eth (2LD): [flo address on ETH Registry, ETH Registry address, root registry address] = 3 elements
 * - sub.flo.eth (3LD): [sub address on flo.eth subregistry, flo address on ETH Registry, ETH Registry address, root registry address] = 4 elements
 *
 * We support up to 3LD (third-level domains), so max 4 elements.
 */
function toNameRegistriesResultType(
  arr: readonly Address[],
): NameRegistriesResultType {
  if (arr.length === 2) {
    // Invalid or non-existent name: [nameOrZero, tld]
    return [arr[0], arr[1]]
  }

  if (arr.length === 3) {
    // 2LD (flo.eth): [nameAddress, ethRegistry, rootRegistry]
    return [arr[0], arr[1], arr[2]]
  }

  if (arr.length === 4) {
    // 3LD (sub.flo.eth): [subnameAddress, nameAddress, ethRegistry, rootRegistry]
    return [arr[0], arr[1], arr[2], arr[3]]
  }

  // Should never reach here - we only support up to 3LD
  throw new Error(
    `Unsupported registry depth: expected 2-4 elements, got ${arr.length}`,
  )
}

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

  debug('[getNameRegistries] Starting discovery for:', name)

  const labels = name.split('.')
  if (labels.length < 2) {
    // For TLD-only or invalid names, name doesn't exist
    debug('[getNameRegistries] TLD-only or invalid name')

    return ok<NameRegistriesResult>({
      registries: [zeroAddress, sepoliaEthRegistryAddress], // [name (doesn't exist), TLD]
      network: 'sepolia',
      protocolVersion: 'ENSv2',
      factory: sepoliaVerifiableFactory,
    })
  }

  // Step 1: Check L2 V2 using ensjs getNameRegistries with RegistryFinder
  debug('[getNameRegistries] Step 1: Checking L2 V2 with RegistryFinder')
  debug(
    '[getNameRegistries] L2 RegistryFinder address:',
    l2RegistryFinderAddress,
  )

  const l2Registries = yield* await fromPromise(
    ensjsGetNameRegistries(l2Client, {
      name,
      address: l2RegistryFinderAddress,
    }),
    (e) => new NameRegistriesError({ cause: e as GetNameRegistriesErrorType }),
  )

  debug('[getNameRegistries] L2 registries (full array):', l2Registries)
  debug('[getNameRegistries] L2 name registry (.at(-2)):', l2Registries.at(-2))
  debug(
    '[getNameRegistries] L2 parent registry (.at(-3)):',
    l2Registries.at(-3),
  )
  debug('[getNameRegistries] L2 TLD registry (.at(-1)):', l2Registries.at(-1))
  debug('[getNameRegistries] L2 root registry (.at(0)):', l2Registries.at(0))

  // If registries.at(-2) exists and is not zeroAddress, name exists on L2
  const l2NameRegistry = l2Registries.at(-2)
  const l2RootRegistry = l2Registries.at(0) // First element should be root registry

  // Check if this is a valid V2 name on L2
  // V2 names should have a non-zero root registry (first element)
  // Invalid/incomplete data (like migrated V1 names) has zeroAddress for root
  if (
    l2NameRegistry &&
    l2NameRegistry !== zeroAddress &&
    l2RootRegistry &&
    l2RootRegistry !== zeroAddress
  ) {
    debug('[getNameRegistries] ✓ Name found on L2 V2')
    debug(
      '[getNameRegistries] Root registry is non-zero - this is a valid V2 name',
    )
    debug('[getNameRegistries] Returning protocol: ENSv2')
    debug('[getNameRegistries] Returning factory:', namechainVerifiableFactory)
    debug('[getNameRegistries] Returning network: namechainSepolia')

    const result = {
      registries: toNameRegistriesResultType(l2Registries),
      network: 'namechainSepolia' as const,
      protocolVersion: 'ENSv2' as const,
      factory: namechainVerifiableFactory,
    }
    debug('[getNameRegistries] Final result:', result)

    return ok<NameRegistriesResult>(result)
  }

  // If L2 returned data but root is zeroAddress, it's invalid - continue to L1 checks
  if (l2NameRegistry && l2NameRegistry !== zeroAddress) {
    debug(
      '[getNameRegistries] ⚠️  L2 returned data but root registry is zeroAddress - invalid/incomplete data',
    )
    debug(
      '[getNameRegistries] This is likely a V1 name, continuing to L1 checks...',
    )
  }

  // Step 2: Check L1 V2 using ensjs getNameRegistries with UniversalResolver
  debug('[getNameRegistries] Step 2: Checking L1 V2 with UniversalResolver')
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

  debug('[getNameRegistries] L1 V2 registries:', l1V2Registries)
  debug(
    '[getNameRegistries] L1 V2 name registry (.at(-2)):',
    l1V2Registries.at(-2),
  )
  debug(
    '[getNameRegistries] L1 V2 root registry (.at(0)):',
    l1V2Registries.at(0),
  )

  // Get V1 registry address for comparison
  const v1RegistryAddress = getChainContractAddress({
    chain: l1Client.chain,
    contract: 'ensRegistry',
  })
  debug('[getNameRegistries] V1 Registry address:', v1RegistryAddress)

  // If registries.at(-2) exists and is not zeroAddress, name exists on L1 V2
  const l1V2NameRegistry = l1V2Registries.at(-2)
  const l1V2RootRegistry = l1V2Registries.at(0)

  // Check if this is actually a V1 registry by comparing addresses
  // For wrapped V1 names, UniversalResolver returns the NameWrapper address, not V1 registry
  // But wrapped V1 names will have zeroAddress for root registry (same as invalid L2 data)
  if (l1V2NameRegistry && l1V2NameRegistry !== zeroAddress) {
    debug('[getNameRegistries] L1 V2 returned non-zero name registry')

    // Check if root registry is non-zero (true V2) or zeroAddress (wrapped V1)
    if (l1V2RootRegistry && l1V2RootRegistry !== zeroAddress) {
      debug(
        '[getNameRegistries] ✓ Name found on L1 V2 (root registry is non-zero - true V2 name)',
      )
      return ok<NameRegistriesResult>({
        registries: toNameRegistriesResultType(l1V2Registries),
        network: 'sepolia',
        protocolVersion: 'ENSv2',
        factory: sepoliaVerifiableFactory,
      })
    }

    // If we reach here, root is zeroAddress but name registry exists
    // This indicates a wrapped V1 name (NameWrapper is the registry)
    // Return as V1 name instead of falling through to V1 check
    debug(
      '[getNameRegistries] ⚠️  Root registry is zeroAddress but name registry exists',
    )
    debug('[getNameRegistries] This is a wrapped V1 name - returning as ENSv1')

    // For wrapped names, use V1 registry address for consistency
    const v1RegistryAddress = getChainContractAddress({
      chain: l1Client.chain,
      contract: 'ensRegistry',
    })

    const pathLabels = labels.slice(0, -1) // drop TLD
    let registries: NameRegistriesResultType

    if (pathLabels.length === 1) {
      registries = [v1RegistryAddress, v1RegistryAddress, v1RegistryAddress]
    } else {
      registries = [
        v1RegistryAddress,
        v1RegistryAddress,
        v1RegistryAddress,
        v1RegistryAddress,
      ]
    }

    debug('[getNameRegistries] Wrapped V1 registries array:', registries)
    debug('[getNameRegistries] Returning protocol: ENSv1')
    debug('[getNameRegistries] Returning factory: null')
    debug('[getNameRegistries] Returning network: sepolia')

    const result = {
      registries,
      network: 'sepolia' as const,
      protocolVersion: 'ENSv1' as const,
      factory: null,
    }
    debug('[getNameRegistries] Final wrapped V1 result:', result)

    return ok<NameRegistriesResult>(result)
  }

  // Step 3: Check L1 V1 using getOwner
  debug('[getNameRegistries] Step 3: Checking L1 V1 with getOwner')
  const l1V1Owner = yield* await fromPromise(
    getOwner(l1Client, { name }),
    (e) => new NameRegistriesError({ cause: e as GetOwnerErrorType }),
  )

  debug('[getNameRegistries] L1 V1 owner:', l1V1Owner)

  // If owner exists, name is on V1 registry - all subnames share the same registry
  if (l1V1Owner?.owner && l1V1Owner.owner !== zeroAddress) {
    debug('[getNameRegistries] ✓ Name found on L1 V1')

    // Get V1 registry address (if not already retrieved)
    const v1RegistryAddress = getChainContractAddress({
      chain: l1Client.chain,
      contract: 'ensRegistry',
    })

    // For V1, all names are registered on the same V1 ETH Registry
    const pathLabels = labels.slice(0, -1) // drop TLD

    let registries: NameRegistriesResultType

    if (pathLabels.length === 1) {
      // flo.eth → [flo address (V1 Registry), ETH Registry (V1 Registry), root (V1 Registry)]
      registries = [v1RegistryAddress, v1RegistryAddress, v1RegistryAddress]
    } else {
      // sub.flo.eth → [sub address (V1 Registry), flo address (V1 Registry), ETH Registry (V1 Registry), root (V1 Registry)]
      registries = [
        v1RegistryAddress,
        v1RegistryAddress,
        v1RegistryAddress,
        v1RegistryAddress,
      ]
    }

    debug('[getNameRegistries] V1 registries array:', registries)
    debug('[getNameRegistries] Returning protocol: ENSv1')
    debug('[getNameRegistries] Returning factory: null (V1 has no factory)')
    debug('[getNameRegistries] Returning network: sepolia')

    const result = {
      registries,
      network: 'sepolia' as const,
      protocolVersion: 'ENSv1' as const,
      factory: null, // V1 doesn't use verifiable factories
    }
    debug('[getNameRegistries] Final V1 result:', result)

    return ok<NameRegistriesResult>(result)
  }

  debug('[getNameRegistries] ✗ Name not found on any registry')
  return ok<NameRegistriesResult>({
    registries: [zeroAddress, sepoliaEthRegistryAddress], // [name (doesn't exist), TLD]
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
