import type { RegistryLabel as BignameRegistryLabel } from '@ens-apps/indexer/bigname'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { Address } from 'viem'
import { envConfig } from '@/config'
import { bigname } from '@/lib/bigname'
import { nullOnNotFound } from '@/utils/bigname/nullOnNotFound'
import { isUnknownLabel } from '@/utils/names/registryChildName'
import { servedExpiry } from '@/utils/names/servedExpiry'

class GetRegistryLabelsError extends TaggedError('GetRegistryLabelsError')<{
  cause: unknown
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
  roleHoldersCount: number
}

const LABELS_LIMIT = 100

/**
 * bigname serves a label it cannot name as `[<labelhash>].<parent>`, which
 * must never be read as a name.
 */
const isPlaceholder = (name: string) => isUnknownLabel(name.split('.')[0] ?? '')

const toRegistryLabelRow = (row: BignameRegistryLabel): RegistryLabelRow => {
  const named = !isPlaceholder(row.name)
  return {
    name: named ? row.name : null,
    labelName: named ? (row.display_name.split('.')[0] ?? null) : null,
    labelhash: row.labelhash ?? null,
    // Null for no expiry (or one too large to date): it does not expire.
    expiryDate: servedExpiry(row),
    roleHoldersCount: row.role_holder_count ?? 0,
  }
}

/**
 * The first hundred labels, by name, with their role-holder counts. A registry
 * bigname has not indexed has none to list.
 */
const getRegistryLabels = ({ address }: GetRegistryLabelsParameters) =>
  nullOnNotFound(
    bigname.registryLabels(envConfig.chain.id, address.toLowerCase(), {
      include: ['counts'],
      page_size: LABELS_LIMIT,
    }),
  )
    .mapErr((cause) => new GetRegistryLabelsError({ cause }))
    .map((response) => (response?.data ?? []).map(toRegistryLabelRow))

const getRegistryLabelsQueryKey = createQueryKey<
  'get-registry-labels',
  GetRegistryLabelsParameters
>('get-registry-labels')

export const getRegistryLabelsQueryOptions = (
  params: GetRegistryLabelsParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistryLabelsQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getRegistryLabels(params),
  })
