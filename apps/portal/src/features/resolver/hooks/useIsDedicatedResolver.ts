import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import type { Address, Hex } from 'viem'
import { getStorageAt } from 'viem/actions'
import { decodeImplementationAddress } from '@/features/resolver/utils/dedicatedResolver'
import { namechainSepolia, sepoliaWithEns } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'

const EIP1967_IMPLEMENTATION_SLOT =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'

const knownDedicatedResolverImplementations = [
  namechainSepolia.contracts.ensDedicatedResolver?.address,
  sepoliaWithEns.contracts.ensDedicatedResolver?.address,
]
  .filter(Boolean)
  .map((address) => address.toLowerCase())

class IsDedicatedResolverError extends TaggedError('IsDedicatedResolverError')<{
  cause: unknown
}> {}

interface GetIsDedicatedResolverParams {
  readonly resolverAddress: Address
}

export const getIsDedicatedResolver = ResultFn(async function* (
  params: GetIsDedicatedResolverParams,
) {
  const normalizedResolverAddress = params.resolverAddress.toLowerCase()
  if (knownDedicatedResolverImplementations.includes(normalizedResolverAddress))
    return ok(true)

  const client = yield* safeGetClient()

  const implementationSlotValue = yield* fromPromise(
    getStorageAt(client, {
      address: params.resolverAddress,
      slot: EIP1967_IMPLEMENTATION_SLOT as Hex,
    }),
    (error) =>
      new IsDedicatedResolverError({
        cause: error,
      }),
  )

  const implementationAddress = decodeImplementationAddress(
    implementationSlotValue,
  )
  if (!implementationAddress) return ok(false)

  return ok(
    knownDedicatedResolverImplementations.includes(
      implementationAddress.toLowerCase(),
    ),
  )
})

const getIsDedicatedResolverQueryKey = createQueryKey<
  'is-dedicated-resolver',
  GetIsDedicatedResolverParams
>('is-dedicated-resolver')

export const getIsDedicatedResolverQueryOptions = (
  params: GetIsDedicatedResolverParams,
) =>
  resultQueryOptions({
    queryKey: getIsDedicatedResolverQueryKey(params),
    queryFn: ({ queryKey: [, queryParams] }) =>
      getIsDedicatedResolver(queryParams),
  })

export const useIsDedicatedResolver = (params: GetIsDedicatedResolverParams) =>
  useQuery(getIsDedicatedResolverQueryOptions(params))
