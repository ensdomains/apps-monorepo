import { type BignameClient, MAX_PAGE_SIZE } from './client'
import { isBignameError } from './errors'
import { fetchAllPages } from './paginate'
import type { RequestOptions } from './request'
import { timestampToBigInt } from './time'
import type { AddressNameRow } from './types'

/**
 * Retry a role-summary page within the server's grant budget. A single name
 * can exceed the budget too; only that page then loses its summary. Other
 * errors reject, and callers retain their cursor and any other expansions.
 */
export const fetchRoleSummaryPage = async <T>(
  fetchPage: (pageSize: number, withRoles: boolean) => Promise<T>,
  pageSize = MAX_PAGE_SIZE,
): Promise<T> => {
  let size = pageSize
  while (true) {
    try {
      return await fetchPage(size, true)
    } catch (error) {
      if (!isBignameError(error, 'unsupported') || error.status !== 422) {
        throw error
      }
      if (size <= 1) return fetchPage(1, false)
      size = Math.max(1, Math.floor(size / 2))
    }
  }
}

type GraceName = Partial<
  Pick<
    AddressNameRow,
    | 'name'
    | 'authority'
    | 'registration_status'
    | 'expires_at'
    | 'grace_ends_at'
    | 'lapsed_registration'
  >
>

/** Only expired ENSv2 .eth registrations still inside their exclusive renewal window. */
export const isV2GraceName = (
  row: GraceName,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean => {
  if (
    row.authority !== 'ens_v2' ||
    !row.name ||
    !/^[^.]+\.eth$/.test(row.name) ||
    row.registration_status !== 'released' ||
    row.lapsed_registration?.release_kind !== 'expired'
  )
    return false
  const expiry = timestampToBigInt(row.expires_at)
  const graceEnd = timestampToBigInt(row.grace_ends_at)
  const now = BigInt(nowSeconds)
  return (
    expiry !== undefined &&
    graceEnd !== undefined &&
    expiry <= now &&
    now < graceEnd
  )
}

/**
 * `any` excludes former owners. Read their recent expiries separately, using
 * only parameters this relation accepts, and leave the relation unchanged:
 * a renewal right is not a current owner/manager grant.
 */
export const fetchV2GraceNames = async (
  client: Pick<BignameClient, 'listAddressNames'>,
  address: string,
  options: RequestOptions & {
    readonly gracePeriodSeconds: number
    readonly nowSeconds?: number
  },
): Promise<readonly AddressNameRow[]> => {
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000)
  const { rows, truncated } = await fetchAllPages(
    (cursor) =>
      client.listAddressNames(
        address,
        {
          namespace: 'ens',
          relation: 'former_owner',
          parent: 'eth',
          sort: 'expires_at',
          order: 'asc',
          expires_after: String(now - options.gracePeriodSeconds),
          expires_before: String(now + 1),
          page_size: MAX_PAGE_SIZE,
          cursor,
        },
        { signal: options.signal },
      ),
    { signal: options.signal },
  )
  if (truncated) throw new Error('Renewable name list is incomplete')
  return rows.filter(
    (row) =>
      isV2GraceName(row, now) &&
      row.relations.includes('former_owner') &&
      row.lapsed_registration?.owner?.toLowerCase() === address.toLowerCase(),
  )
}
