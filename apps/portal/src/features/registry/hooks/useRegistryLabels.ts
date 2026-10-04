import {
  type BignameError,
  type RegistryLabelRow as BignameRegistryLabelRow,
  nullOnNotFound,
  timestampToSeconds,
} from '@ens-apps/bigname'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise } from 'neverthrow'
import type { Address } from 'viem'
import { bigname } from '@/lib/bigname'
import { sepoliaWithEns } from '@/lib/wagmi'

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
  labelhash: string
  /** Unix seconds; null means the label does not expire. */
  expiryDate: number | null
  /** Distinct accounts holding a label-scoped role on this label. */
  roleHoldersCount: number
}

const LABELS_LIMIT = 100

/**
 * bigname serves a label it cannot name as `[<labelhash>].<parent>`, which
 * must never be read as a name.
 */
const isPlaceholder = (name: string) => name.startsWith('[')

const toRegistryLabelRow = (row: BignameRegistryLabelRow): RegistryLabelRow => {
  const named = !isPlaceholder(row.name)
  return {
    name: named ? row.name : null,
    labelName: named ? (row.display_name.split('.')[0] ?? null) : null,
    labelhash: row.labelhash,
    // Omitted for an unrepresentable (max uint64) expiry: it does not expire.
    expiryDate: timestampToSeconds(row.expires_at) ?? null,
    roleHoldersCount: row.role_holder_count ?? 0,
  }
}

/**
 * The first hundred labels, by name, with their role-holder counts. A registry
 * bigname has not indexed has none to list.
 */
const getRegistryLabels = ({ address }: GetRegistryLabelsParameters) =>
  fromPromise(
    nullOnNotFound(
      bigname.listRegistryLabels(sepoliaWithEns.id, address.toLowerCase(), {
        include: ['counts'],
        page_size: LABELS_LIMIT,
      }),
    ),
    (e) => new GetRegistryLabelsError({ cause: e as BignameError }),
  ).map((response) => (response?.data ?? []).map(toRegistryLabelRow))

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
