import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  getNameRegistryAddress as ensjs_getNameRegistryAddress,
  type GetNameRegistryAddressErrorType,
  type GetNameRegistryAddressParameters,
} from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { zeroAddress } from 'viem'
import { sepolia } from 'viem/chains'
import { safeGetClient } from '@/lib/wagmi/helpers'

// Known registry addresses
export const L1_ETH_REGISTRY =
  '0x37AFa22dBdafa3E26541e1036b99c58a6Be04f5e' as Address
export const L2_ETH_REGISTRY =
  '0x5fb63bbd34de21688c8aa8131be1c3b4a477109c' as Address

export type ChainLocation = 'L1' | 'L2' | 'unknown'

export type NameChainLocation = {
  location: ChainLocation
  registryAddress: Address | null
  chainName: string
  chainId: number
}

export type GetNameChainLocationParameters = Omit<
  GetNameRegistryAddressParameters,
  'registryAddress'
>

export class GetNameChainLocationError extends TaggedError(
  'GetNameChainLocationError',
)<{
  cause: GetNameRegistryAddressErrorType
}> {}

/**
 * Determines on which logical chain (L1 or L2) a name has a registry.
 *
 * It does two lookups on Sepolia:
 *  - once using the L1 .eth registry address
 *  - once using the L2 .eth registry address
 */
export const getNameChainLocation = ResultFn(async function* (
  params: GetNameChainLocationParameters,
) {
  const client = yield* safeGetClient()

  // L1 probe
  const l1RegistryAddress = yield* await fromPromise(
    ensjs_getNameRegistryAddress(client, {
      ...params,
      registryAddress: L1_ETH_REGISTRY,
    }),
    (e) =>
      new GetNameChainLocationError({
        cause: e as GetNameRegistryAddressErrorType,
      }),
  )

  // L2 probe
  const l2RegistryAddress = yield* await fromPromise(
    ensjs_getNameRegistryAddress(client, {
      ...params,
      registryAddress: L2_ETH_REGISTRY,
    }),
    (e) =>
      new GetNameChainLocationError({
        cause: e as GetNameRegistryAddressErrorType,
      }),
  )

  let location: ChainLocation = 'unknown'
  let registryAddress: Address | null = null
  let chainName = 'Unknown'
  let chainId = 0

  const hasL1 = l1RegistryAddress !== zeroAddress
  const hasL2 = l2RegistryAddress !== zeroAddress

  if (hasL1 && !hasL2) {
    location = 'L1'
    registryAddress = l1RegistryAddress
    chainName = 'Sepolia'
    chainId = sepolia.id
  } else if (!hasL1 && hasL2) {
    location = 'L2'
    registryAddress = l2RegistryAddress
    chainName = 'Namechain'
    chainId = sepolia.id
  } else if (hasL1 && hasL2) {
    // choose a priority; here, prefer L2
    location = 'L2'
    registryAddress = l2RegistryAddress
    chainName = 'Namechain'
    chainId = sepolia.id
  } else {
    location = 'unknown'
    registryAddress = null
  }

  const result: NameChainLocation = {
    location,
    registryAddress,
    chainName,
    chainId,
  }

  return ok(result)
})

export const getNameChainLocationQueryKey = createQueryKey<
  'get-name-chain-location',
  GetNameChainLocationParameters
>('get-name-chain-location')

export const getNameChainLocationQueryOptions = (
  params: GetNameChainLocationParameters,
) =>
  resultQueryOptions({
    queryKey: getNameChainLocationQueryKey(params),
    queryFn: ({
      queryKey: [, params],
    }: {
      queryKey: readonly [string, GetNameChainLocationParameters]
    }) => getNameChainLocation(params),
  })
