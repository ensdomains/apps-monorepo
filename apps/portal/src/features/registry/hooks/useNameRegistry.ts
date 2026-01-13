import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  getNameRegistryAddress as ensjs_getNameRegistryAddress,
  type GetNameRegistryAddressErrorType,
  type GetNameRegistryAddressParameters,
} from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import { type Address, zeroAddress } from 'viem'
import {
  safeGetClient,
  safeGetNamechainSepoliaClient,
} from '@/lib/wagmi/helpers'
import type { WithEnsNetwork } from '@/utils/types'

class NameRegistryError extends TaggedError('nameRegistryError')<{
  cause: GetNameRegistryAddressErrorType
}> {}

type GetNameRegistryReturnType = WithEnsNetwork<{
  registryAddress: Address
  parentRegistryAddress: Address
}>

/**
 * Fetches name subregistry and ETH registry
 */
const getNameRegistry = ResultFn(async function* (
  params: GetNameRegistryAddressParameters,
) {
  const l1Client = yield* safeGetClient()
  const namechainClient = yield* safeGetNamechainSepoliaClient()

  const l1RegistryAddress = yield* await fromPromise(
    ensjs_getNameRegistryAddress(l1Client, params),
    (e) =>
      new NameRegistryError({ cause: e as GetNameRegistryAddressErrorType }),
  )

  if (l1RegistryAddress !== zeroAddress) {
    return ok<GetNameRegistryReturnType>({
      registryAddress: l1RegistryAddress,
      parentRegistryAddress: params.registryAddress,
      network: 'sepolia',
    })
  }

  const l2RegistryAddress = yield* await fromPromise(
    ensjs_getNameRegistryAddress(namechainClient, params),
    (e) =>
      new NameRegistryError({ cause: e as GetNameRegistryAddressErrorType }),
  )

  return ok<GetNameRegistryReturnType>({
    network: 'namechainSepolia',
    parentRegistryAddress: params.registryAddress,
    registryAddress: l2RegistryAddress,
  })
})

// Query key factory
const nameRegistryQueryKey = createQueryKey<
  'nameRegistry',
  GetNameRegistryAddressParameters
>('nameRegistry')

// React Query options for fetching name registries
export const getNameRegistryQueryOptions = (
  params: GetNameRegistryAddressParameters,
) =>
  resultQueryOptions({
    queryKey: nameRegistryQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getNameRegistry(params),
  })
