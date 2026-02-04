/**
 * Hook to get the resolver address for a name.
 *
 * Handles both V1 (Sepolia) and V2 (Namechain) names by calling the
 * appropriate registry contract.
 */

import { ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getNameResolverAddress as getNameResolverAddressV2 } from '@ensdomains/ensjs/public/v2'
import { useQuery } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import { type Address, namehash, zeroAddress } from 'viem'
import { readContract } from 'viem/actions'
import {
  safeGetClient,
  safeGetNamechainSepoliaClient,
} from '@/lib/wagmi/helpers'
import type { EnsNetworkName } from '@/utils/types'

// ============================================================================
// Constants
// ============================================================================

/** V1 ENS Registry on Sepolia */
const ENS_REGISTRY_V1 = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as Address

/** ABI for V1 ENS Registry resolver lookup */
const ENS_REGISTRY_V1_ABI = [
  {
    inputs: [{ name: 'node', type: 'bytes32' }],
    name: 'resolver',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// ============================================================================
// Types
// ============================================================================

export type GetNameResolverAddressParams = {
  name: string
  network: EnsNetworkName
}

// ============================================================================
// Error
// ============================================================================

class GetNameResolverAddressError extends TaggedError(
  'GetNameResolverAddressError',
)<{
  cause: unknown
}> {}

// ============================================================================
// Pure function
// ============================================================================

/**
 * Get the resolver address for a name from the appropriate registry.
 *
 * - V1 (sepolia): Calls ENS Registry's `resolver(node)` with namehash
 * - V2 (namechainSepolia): Calls ETHRegistry's `getResolver(label)` with label
 */
export const getNameResolverAddress = ResultFn(async function* (
  params: GetNameResolverAddressParams,
) {
  const { name, network } = params

  if (network === 'namechainSepolia') {
    // V2: Use Namechain client and ETHRegistry via ensjs
    const client = yield* safeGetNamechainSepoliaClient()
    const label = name.split('.')[0]

    const resolverAddress = yield* fromPromise(
      getNameResolverAddressV2(client, {
        registryAddress: ENS_SEPOLIA_CONTRACTS.ETHRegistry as Address,
        label,
      }),
      (e) => new GetNameResolverAddressError({ cause: e }),
    )

    if (!resolverAddress || resolverAddress === zeroAddress) {
      return ok(null)
    }

    return ok(resolverAddress)
  }

  // V1: Use Sepolia client and V1 ENS Registry
  const client = yield* safeGetClient()
  const node = namehash(name)

  const resolverAddress = yield* fromPromise(
    readContract(client, {
      address: ENS_REGISTRY_V1,
      abi: ENS_REGISTRY_V1_ABI,
      functionName: 'resolver',
      args: [node],
    }),
    (e) => new GetNameResolverAddressError({ cause: e }),
  )

  if (!resolverAddress || resolverAddress === zeroAddress) {
    return ok(null)
  }

  return ok(resolverAddress)
})

// ============================================================================
// Query options
// ============================================================================

const getNameResolverAddressQueryKey = createQueryKey<
  'get-name-resolver-address',
  GetNameResolverAddressParams
>('get-name-resolver-address')

export const getNameResolverAddressQueryOptions = (
  params: GetNameResolverAddressParams,
) =>
  resultQueryOptions({
    queryKey: getNameResolverAddressQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getNameResolverAddress(params),
  })

// ============================================================================
// Hook
// ============================================================================

export type UseNameResolverAddressParams = {
  name: string
  network: EnsNetworkName | undefined
}

/**
 * Hook to get the resolver address for a name.
 *
 * @param name - The ENS name (e.g., "myname.eth")
 * @param network - The network where the name is registered ('sepolia' or 'namechainSepolia')
 * @returns Query result with resolver address or null
 */
export function useNameResolverAddress({
  name,
  network,
}: UseNameResolverAddressParams) {
  return useQuery({
    ...getNameResolverAddressQueryOptions({
      name,
      network: network ?? 'sepolia',
    }),
    enabled: !!network,
  })
}
