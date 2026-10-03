import type {
  NameSummary,
  NamesForAddressQuery,
  ReadNamesForAddress,
} from '../reads/namesForAddress.types'
import { toDate, toProtocol, toReadError, toRelations } from './adapters'
import type { BignameClient } from './client'
import type { AddressName, AddressNamesQuery, Authority } from './types'

const SORT_FIELDS = {
  name: 'name',
  expiry: 'expires_at',
  registered: 'registered_at',
} as const

const AUTHORITY: Record<'v1' | 'v2', Authority> = {
  v1: 'ens_v1',
  v2: 'ens_v2',
}

const toQuery = (query: NamesForAddressQuery): AddressNamesQuery => ({
  relation: query.relations?.length ? query.relations : 'any',
  authority: query.protocol && AUTHORITY[query.protocol],
  is_migrated: query.migratedOnly ? 'true' : undefined,
  q: query.prefix,
  sort: query.sort && SORT_FIELDS[query.sort],
  order: query.order,
  include: query.includeCounts ? ['counts'] : undefined,
  page_size: query.pageSize,
  cursor: query.cursor,
})

const toNameSummary = (row: AddressName): NameSummary => ({
  name: row.name,
  displayName: row.display_name,
  namehash: row.namehash,
  protocol: toProtocol(row.authority),
  relations: toRelations(row.relations),
  isPrimary: row.is_primary,
  isMigrated: row.migrated_at !== undefined,
  registrationStatus: row.registration_status,
  expiresAt: toDate(row.expires_at),
  registeredAt: toDate(row.registered_at),
  createdAt: toDate(row.created_at),
  ...(row.subname_count !== undefined && { subnameCount: row.subname_count }),
  ...(row.record_count !== undefined && { recordCount: row.record_count }),
})

export const readNamesForAddress =
  (client: BignameClient): ReadNamesForAddress =>
  (query) =>
    client
      .addressNames(query.address, toQuery(query))
      .map(({ data, page }) => ({
        items: data.map(toNameSummary),
        nextCursor: page?.next_cursor ?? null,
        totalCount: page?.total_count ?? null,
      }))
      .mapErr(toReadError)
