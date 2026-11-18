import {
  type RegistryLabel as IndexedRegistryLabel,
  type IndexerReadError,
  retryStaleRead,
} from '@ens-apps/indexer/reads'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultInfiniteQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { Address } from 'viem'
import { indexer } from '@/lib/indexer'
import { isEncodedLabelhash } from '@/utils/token/isNormalized'

class GetRegistryLabelsError extends TaggedError('GetRegistryLabelsError')<{
  cause: IndexerReadError
}> {}

type GetRegistryLabelsParameters = {
  address: Address
}

export type RegistryLabelRow = {
  /** Full ENS name (e.g. "lmao.chakri.eth"); null if the label has no readable name. */
  name: string | null
  /** The label segment (e.g. "lmao"); null when unknown. */
  labelName: string | null
  /** Null on the rare row the indexer serves without one. */
  labelhash: string | null
  /** Unix seconds; null means the label does not expire. */
  expiryDate: bigint | null
  /** Distinct accounts holding a label-scoped role on this label; undefined when the indexer does not count them. */
  roleHoldersCount: number | undefined
}

export const REGISTRY_LABELS_PAGE_SIZE = 100

/** One page of a registry's labels, with the registry's total beside it. */
export type RegistryLabelsPage = {
  readonly labels: readonly RegistryLabelRow[]
  readonly totalCount: number | undefined
  readonly nextCursor: string | undefined
}

/**
 * The indexer serves a label it cannot name as `[<labelhash>].<parent>`,
 * which must never be read as a name.
 */
const isPlaceholder = (name: string) =>
  isEncodedLabelhash(name.split('.')[0] ?? '')

const toRegistryLabelRow = (row: IndexedRegistryLabel): RegistryLabelRow => {
  const named = !isPlaceholder(row.name)
  return {
    name: named ? row.name : null,
    labelName: named ? (row.displayName.split('.')[0] ?? null) : null,
    labelhash: row.labelhash,
    // Null for no expiry (or one too large to date): it does not expire.
    expiryDate: row.expiresAt
      ? BigInt(Math.floor(row.expiresAt.getTime() / 1000))
      : null,
    roleHoldersCount: row.roleHolderCount,
  }
}

/**
 * One page of labels, by name, with their role-holder counts. A registry
 * the indexer has not indexed has none to list.
 */
const getRegistryLabelsPage = (
  { address }: GetRegistryLabelsParameters,
  cursor: string | undefined,
  signal?: AbortSignal,
) =>
  retryStaleRead(
    (requestSignal) =>
      indexer.getRegistryLabels(
        {
          address,
          includeCounts: true,
          pageSize: REGISTRY_LABELS_PAGE_SIZE,
          ...(cursor && { cursor }),
        },
        { signal: requestSignal },
      ),
    { signal },
  )
    .mapErr((cause) => new GetRegistryLabelsError({ cause }))
    .map(
      (page): RegistryLabelsPage => ({
        labels: (page?.items ?? []).map(toRegistryLabelRow),
        totalCount: page?.totalCount ?? undefined,
        nextCursor: page?.nextCursor ?? undefined,
      }),
    )

export const getRegistryLabelsQueryKey = createQueryKey<
  'get-registry-labels',
  GetRegistryLabelsParameters
>('get-registry-labels')

export const getRegistryLabelsQueryOptions = (
  params: GetRegistryLabelsParameters,
) =>
  resultInfiniteQueryOptions({
    queryKey: getRegistryLabelsQueryKey(params),
    queryFn: ({ pageParam, signal }) =>
      getRegistryLabelsPage(params, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: RegistryLabelsPage) => last.nextCursor,
  })
