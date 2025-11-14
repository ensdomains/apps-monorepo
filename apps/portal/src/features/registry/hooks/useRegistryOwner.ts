import { useOwnerOf } from '@ens-apps/l2-primary/hooks'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise, ok } from 'neverthrow'
import type { Address, Hex } from 'viem'
import { readContract } from 'viem/actions'
import { safeGetClient } from '@/lib/wagmi/helpers'

export class GetRegistryOwnerError extends TaggedError(
  'GetRegistryOwnerError',
)<{
  cause: Error
}> {}

export const getRegistryOwner = ResultFn(async function* ({
  registryAddress,
  node,
}: {
  registryAddress: Address
  node: Hex
}) {
  const client = yield* safeGetClient()

  // Convert node (namehash) to tokenId (uint256)
  const tokenId = BigInt(node)

  const { getOwnerOfRequest } = useOwnerOf({ registryAddress })
  const request = getOwnerOfRequest(tokenId)

  const owner = yield* await fromPromise(
    readContract(client, request),
    (e) =>
      new GetRegistryOwnerError({
        cause: e as Error,
      }),
  )

  return ok(owner)
})

export const getRegistryOwnerQueryKey = createQueryKey<
  'get-registry-owner',
  { registryAddress: Address; node: Hex }
>('get-registry-owner')

export const getRegistryOwnerQueryOptions = (params: {
  registryAddress: Address
  node: Hex
}) =>
  resultQueryOptions({
    queryKey: getRegistryOwnerQueryKey(params),
    queryFn: ({
      queryKey: [, params],
    }: {
      queryKey: readonly [string, { registryAddress: Address; node: Hex }]
    }) => getRegistryOwner(params),
  })
