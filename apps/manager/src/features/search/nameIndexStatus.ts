import {
  type BignameResponse,
  isBignameError,
  isNameProfile,
  type NameDetail,
} from '@ens-apps/bigname'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { queryOptions } from '@tanstack/react-query'
import { bigname } from '@/lib/bigname'

/**
 * - `held`: bigname knows the name and it has a current registration. A
 *   `status: unsupported` answer counts too: bigname knows the name exists
 *   even though it cannot vouch for its details.
 * - `released`: known, but its registration lapsed or never existed
 *   (`released`, `unregistered`), so nobody holds it.
 * - `not_indexed`: `404`, or a name bigname rejects as invalid (`400`).
 */
export type NameIndexStatus = 'held' | 'released' | 'not_indexed'

const toNameIndexStatus = (
  detail: BignameResponse<NameDetail> | null,
): NameIndexStatus => {
  if (!detail) return 'not_indexed'
  if (!isNameProfile(detail.data)) return 'held'
  const status = detail.data.registration_status
  return status === 'released' || status === 'unregistered'
    ? 'released'
    : 'held'
}

export const getNameIndexStatus = async (
  name: string,
  signal?: AbortSignal,
): Promise<NameIndexStatus> => {
  try {
    return toNameIndexStatus(await bigname.getName(name, undefined, { signal }))
  } catch (error) {
    if (isBignameError(error, 'invalid_input')) return 'not_indexed'
    throw error
  }
}

export const nameIndexStatusQuery = (name: string) =>
  queryOptions({
    queryKey: qk('search', 'name_index_status', { name }),
    queryFn: ({ signal }) => getNameIndexStatus(name, signal),
    meta: {
      dependsOn: ['indexer'],
    },
  })
