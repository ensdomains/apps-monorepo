import type { BignameError } from '@ens-apps/indexer/bigname'
import {
  type RegistryLabel as BignameRegistryLabel,
  toExpirySeconds,
} from '@ens-apps/indexer/bigname'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultInfiniteQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { Address } from 'viem'
import { envConfig } from '@/config'
import { bigname } from '@/lib/bigname'
import { nullOnNotFound } from '@/utils/bigname/nullOnNotFound'
import { isEncodedLabelhash } from '@/utils/token/isNormalized'

class GetRegistryLabelsError extends TaggedError('GetRegistryLabelsError')<{
  cause: BignameError
}> {}

type GetRegistryLabelsParameters = {
  address: Address
}

export type RegistryLabelRow = {
  /** Full ENS name (e.g. "lmao.chakri.eth"); null if the label has no readable name. */
  name: string | null
  /** The label segment (e.g. "lmao"); null when unknown. */
  labelName: string | null
  /** Null on the rare row bigname serves without one. */
  labelhash: string | null
  /** Unix seconds; null means the label does not expire. */
  expiryDate: bigint | null
  /** Distinct accounts holding a label-scoped role on this label. */
  /** Undefined when bigname does not count them. */
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
 * bigname serves a label it cannot name as `[<labelhash>].<parent>`, which
 * must never be read as a name.
 */
const isPlaceholder = (name: string) =>
  isEncodedLabelhash(name.split('.')[0] ?? '')

const toRegistryLabelRow = (row: BignameRegistryLabel): RegistryLabelRow => {
  const named = !isPlaceholder(row.name)
  return {
    name: named ? row.name : null,
    labelName: named ? (row.display_name.split('.')[0] ?? null) : null,
    labelhash: row.labelhash ?? null,
    // Null for no expiry (or one too large to date): it does not expire.
    expiryDate: toExpirySeconds(row),
    roleHoldersCount: row.role_holder_count ?? undefined,
  }
}

/**
 * One page of labels, by name, with their role-holder counts. A registry
 * bigname has not indexed has none to list.
 */
const getRegistryLabelsPage = (
  { address }: GetRegistryLabelsParameters,
  cursor: string | undefined,
) =>
  nullOnNotFound(
    bigname.registryLabels(envConfig.chain.id, address.toLowerCase(), {
      include: ['counts'],
      page_size: REGISTRY_LABELS_PAGE_SIZE,
      ...(cursor && { cursor }),
    }),
  )
    .mapErr((cause) => new GetRegistryLabelsError({ cause }))
    .map(
      (response): RegistryLabelsPage => ({
        labels: (response?.data ?? []).map(toRegistryLabelRow),
        totalCount: response?.page?.total_count ?? undefined,
        nextCursor: response?.page?.next_cursor ?? undefined,
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
    queryFn: ({ pageParam }) => getRegistryLabelsPage(params, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: RegistryLabelsPage) => last.nextCursor,
  })
