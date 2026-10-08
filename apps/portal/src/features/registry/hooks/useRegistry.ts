import { timestampToSeconds } from '@ens-apps/indexer/bigname'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { type Address, type Hash, zeroHash } from 'viem'
import { envConfig } from '@/config'
import { bigname } from '@/lib/bigname'
import { nullOnNotFound } from '@/utils/bigname/nullOnNotFound'

class GetRegistryInfoError extends TaggedError('GetRegistryInfoError')<{
  cause: unknown
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
  /** Unix seconds; 0 when bigname has no creation position. */
  createdAt: number
  /**
   * The transaction that created (or first linked) the registry. Null for a
   * registry the deployment declares rather than observes, such as the root.
   */
  createdTransactionHash: Hash | null
  labelCount: number
  /** Declared role assignments: one account on two resources counts twice. */
  roleCount: number
  eventCount: number
  referencedBy: { name: string | null }[]
}

const getRegistryInfo = ({ address }: GetRegistryInfoParameters) =>
  nullOnNotFound(
    bigname.registry(envConfig.chain.id, address.toLowerCase(), {
      include: ['counts'],
    }),
  )
    .mapErr((cause) => new GetRegistryInfoError({ cause }))
    .map((response): RegistryInfo | null => {
      // null = bigname has no record for this address (not a registry, or not
      // yet indexed). Distinct from a registry with zero labels/roles.
      if (!response) return null
      const registry = response.data
      return {
        address,
        name: registry.name?.name ?? '',
        namehash: registry.name?.namehash ?? zeroHash,
        createdBlock: registry.created_block_number ?? 0,
        createdAt: timestampToSeconds(registry.created_at) ?? 0,
        createdTransactionHash: registry.created_transaction_hash,
        labelCount: registry.counts.labels ?? 0,
        roleCount: registry.counts.roles ?? 0,
        eventCount: registry.counts.events ?? 0,
        referencedBy: registry.referenced_by.data.map(({ name }) => ({ name })),
      }
    })

const getRegistryInfoQueryKey = createQueryKey<
  'get-registry-info',
  GetRegistryInfoParameters
>('get-registry-info')

export const getRegistryInfoQueryOptions = (
  params: GetRegistryInfoParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistryInfoQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getRegistryInfo(params),
  })
