import { type BignameError, timestampToSeconds } from '@ens-apps/bigname'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise } from 'neverthrow'
import type { Address, Hash } from 'viem'
import { bigname } from '@/lib/bigname'
import { sepoliaWithEns } from '@/lib/wagmi'

class GetRegistryLabelCountError extends TaggedError(
  'GetRegistryLabelCountError',
)<{
  cause: BignameError
}> {}

type GetRegistryLabelCountParameters = {
  address: Address
}

export type RegistrySummary = {
  labelCount: number
  /** Unix seconds; 0 when bigname has no creation position. */
  createdAt: number
  creationTransactionHash: Hash | null
}

/** The registry tree's summary line: label count and creation, from the overview. */
const getRegistryLabelCount = ({ address }: GetRegistryLabelCountParameters) =>
  fromPromise(
    bigname.getRegistry(sepoliaWithEns.id, address.toLowerCase()),
    (e) => new GetRegistryLabelCountError({ cause: e as BignameError }),
  ).map((response): RegistrySummary | null => {
    // null = bigname has no record for this registry address (not yet indexed,
    // or contract doesn't exist). Distinct from a registry with 0 labels.
    if (!response) return null
    const registry = response.data
    return {
      labelCount: registry.counts.labels ?? 0,
      createdAt: timestampToSeconds(registry.created_at) ?? 0,
      creationTransactionHash: registry.created_transaction_hash,
    }
  })

const getRegistryLabelCountQueryKey = createQueryKey<
  'get-registry-label-count',
  GetRegistryLabelCountParameters
>('get-registry-label-count')

export const getRegistryLabelCountQueryOptions = (
  params: GetRegistryLabelCountParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistryLabelCountQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getRegistryLabelCount(params),
  })
