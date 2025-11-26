import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  type GetNameRegistryAddressErrorType,
  getNameRegistryAddress,
} from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import { zeroAddress } from 'viem'
import { sepolia } from 'viem/chains'
import { L1_ETH_REGISTRY, L2_ETH_REGISTRY } from '@/lib/constants/registry'
import { REGISTRY_CACHE } from '@/lib/query/cache'
import { safeGetClient } from '@/lib/wagmi/helpers'
import type { NameChainLocation } from '../components/NetworkCard'

export type GetNameChainLocationParameters = {
  label: string
}

export class GetNameChainLocationError extends TaggedError(
  'GetNameChainLocationError',
)<{
  cause: GetNameRegistryAddressErrorType
}> {}

export const getNameChainLocation = ResultFn(async function* ({
  label,
}: GetNameChainLocationParameters) {
  const client = yield* safeGetClient()

  const l1 = yield* await fromPromise(
    getNameRegistryAddress(client, {
      registryAddress: L1_ETH_REGISTRY,
      label,
    }),
    (e) =>
      new GetNameChainLocationError({
        cause: e as GetNameRegistryAddressErrorType,
      }),
  )

  if (l1 !== zeroAddress) {
    return ok<NameChainLocation>({
      location: 'sepolia',
      registryAddress: l1,
      name: 'Sepolia',
      chainId: sepolia.id,
    })
  }

  const l2 = yield* await fromPromise(
    getNameRegistryAddress(client, {
      registryAddress: L2_ETH_REGISTRY,
      label,
    }),
    (e) =>
      new GetNameChainLocationError({
        cause: e as GetNameRegistryAddressErrorType,
      }),
  )

  if (l2 !== zeroAddress) {
    return ok<NameChainLocation>({
      location: 'namechainSepolia',
      registryAddress: l2,
      name: 'Namechain',
      chainId: sepolia.id, // temporary until Namechain launches
    })
  }

  return ok<NameChainLocation>({
    location: 'sepolia',
    registryAddress: l1,
    name: 'Sepolia',
    chainId: sepolia.id,
  })
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
    queryFn: ({ queryKey: [, params] }) => getNameChainLocation(params),
    ...REGISTRY_CACHE,
  })
