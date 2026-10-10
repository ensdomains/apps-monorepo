import type {
  NameSummary,
  NamesForAddressQuery,
  ReadNamesForAddress,
} from '../reads/namesForAddress.types'
import {
  toDate,
  toExactSeconds,
  toExpiresAt,
  toProtocol,
  toReadError,
  toRelations,
} from './adapters'
import type { BignameClient } from './client'
import type { AddressName, AddressNamesQuery, Authority } from './types'

const SORT_FIELDS = {
  name: 'name',
  expiry: 'expires_at',
  registered: 'registered_at',
  created: 'created_at',
} as const

// `ens_v0` is an ENSv1 name whose record still sits in the 2017 registry.
const AUTHORITIES: Record<'v1' | 'v2', readonly Authority[]> = {
  v1: ['ens_v1', 'ens_v0'],
  v2: ['ens_v2'],
}

const toInclude = (
  query: NamesForAddressQuery,
): AddressNamesQuery['include'] => {
  const include = [
    ...(query.includeCounts ? (['counts'] as const) : []),
    ...(query.includeRoles ? (['role_summary'] as const) : []),
    ...(query.includeTotal ? (['total_count'] as const) : []),
  ]
  return include.length > 0 ? include : undefined
}

const toQuery = (query: NamesForAddressQuery): AddressNamesQuery => ({
  // Unscoped, bigname also lists other namespaces such as Basenames.
  namespace: 'ens',
  relation: query.relations?.length ? query.relations : 'any',
  authority: query.protocol && AUTHORITIES[query.protocol],
  is_migrated: query.migratedOnly ? 'true' : undefined,
  parent: query.parent,
  q: query.contains ?? query.prefix,
  match: query.contains === undefined ? undefined : 'contains',
  sort: query.sort && SORT_FIELDS[query.sort],
  order: query.order,
  include: toInclude(query),
  page_size: query.pageSize,
  cursor: query.cursor,
})

const toHeldPowers = (row: AddressName, address: string) => {
  const holder = row.role_summary?.find(
    (summary) => summary.address.toLowerCase() === address.toLowerCase(),
  )
  return [...new Set(holder?.grants.flatMap((grant) => grant.powers))]
}

const toNameSummary = (row: AddressName, address: string): NameSummary => ({
  name: row.name,
  displayName: row.display_name,
  namehash: row.namehash,
  protocol: toProtocol(row.authority),
  relations: toRelations(row.relations),
  isPrimary: row.is_primary,
  isMigrated: row.migrated_at !== undefined,
  registrationStatus: row.status,
  expiresAt: toExpiresAt(row),
  servedExpiry: toExactSeconds(row.expires_at),
  registeredAt: toDate(row.registered_at),
  createdAt: toDate(row.created_at),
  ...(row.subname_count !== undefined && { subnameCount: row.subname_count }),
  ...(row.record_count !== undefined && { recordCount: row.record_count }),
  ...(row.role_summary !== undefined && {
    heldPowers: toHeldPowers(row, address),
  }),
})

export const readNamesForAddress =
  (client: BignameClient): ReadNamesForAddress =>
  (query) =>
    client
      .addressNames(query.address, toQuery(query))
      .map(({ data, page }) => ({
        items: data.map((row) => toNameSummary(row, query.address)),
        nextCursor: page?.next_cursor ?? null,
        totalCount: page?.total_count ?? null,
      }))
      .mapErr(toReadError)
