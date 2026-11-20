import { type IndexerReadError, retryStaleRead } from '@ens-apps/indexer/reads'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { type Address, type Hash, zeroHash } from 'viem'
import { indexer } from '@/lib/indexer'

class GetRegistryInfoError extends TaggedError('GetRegistryInfoError')<{
  cause: IndexerReadError
}> {}

type GetRegistryInfoParameters = {
  address: Address
}

export type RegistryInfo = {
  address: Address
  /** This registry's own ENS name (e.g. "eth"); empty for the root. */
  name: string
  namehash: string
  createdBlock: number
  /** Unix seconds; 0 when the indexer has no creation position. */
  createdAt: number
  /**
   * The transaction that created (or first linked) the registry. Null for a
   * registry the deployment declares rather than observes, such as the root.
   */
  createdTransactionHash: Hash | null
  /** Undefined when the indexer does not count them. */
  labelCount: number | undefined
  referencedBy: { name: string | null }[]
  /** True when the indexer has more referencing names than the first page lists. */
  readonly referencedByHasMore: boolean
}

const getRegistryInfo = (
  { address }: GetRegistryInfoParameters,
  signal?: AbortSignal,
) =>
  retryStaleRead(
    (requestSignal) =>
      indexer.getRegistry({ address }, { signal: requestSignal }),
    { signal },
  )
    .mapErr((cause) => new GetRegistryInfoError({ cause }))
    .map((registry): RegistryInfo | null => {
      // null = the indexer has no record for this address (not a registry, or
      // not yet indexed). Distinct from a registry with zero labels/roles.
      if (!registry) return null
      return {
        address,
        name: registry.name?.name ?? '',
        namehash: registry.name?.namehash ?? zeroHash,
        createdBlock: registry.createdBlock,
        createdAt: registry.createdAt
          ? Math.floor(registry.createdAt.getTime() / 1000)
          : 0,
        createdTransactionHash: registry.createdTransactionHash,
        labelCount: registry.labelCount ?? undefined,
        referencedBy: registry.referencedBy.items.map(({ name }) => ({ name })),
        referencedByHasMore: registry.referencedBy.nextCursor !== null,
      }
    })

export const getRegistryInfoQueryKey = createQueryKey<
  'get-registry-info',
  GetRegistryInfoParameters
>('get-registry-info')

export const getRegistryInfoQueryOptions = (
  params: GetRegistryInfoParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistryInfoQueryKey(params),
    queryFn: ({ queryKey: [, params], signal }) =>
      getRegistryInfo(params, signal),
  })
