import { namehash } from 'viem'
import type { NameRelation } from '../reads/common.types'
import type {
  NameSummary,
  NamesForAddressQuery,
} from '../reads/namesForAddress.types'

const ALL_RELATIONS: readonly NameRelation[] = [
  'owner',
  'manager',
  'role_holder',
]

export const toRelations = (query: NamesForAddressQuery) =>
  query.relations?.length ? query.relations : ALL_RELATIONS

/** Whether `name` is a direct child of `parent`. */
export const isChildOf = (name: string, parent: string) =>
  name.endsWith(`.${parent}`) &&
  name.split('.').length === parent.split('.').length + 1

const V2_SORT = {
  name: 'name',
  expiry: 'expiryDate',
  registered: 'registrationDate',
  created: 'createdAt',
} as const

// The subgraph schema has no registration date on a domain; creation is closest.
const V1_SORT = {
  name: 'name',
  expiry: 'expiryDate',
  registered: 'createdAt',
  created: 'createdAt',
} as const

export const toOrder = (query: NamesForAddressQuery) => ({
  sort: query.sort ?? 'name',
  order: query.order ?? 'asc',
})

type Where = Readonly<Record<string, unknown>>

/** The text filter both schemas accept; `contains` wins over `prefix`. */
const toTextFilter = (query: NamesForAddressQuery): Where =>
  query.contains !== undefined
    ? { name_contains: query.contains }
    : query.prefix !== undefined
      ? { name_starts_with: query.prefix }
      : {}

/** zigens filter for a page of ENSv2 names, null when none can match; the owner is also the manager in ENSv2. */
export const toV2Variables = (
  query: NamesForAddressQuery,
  roleNames: readonly string[],
  after: string | undefined,
  pageSize: number,
) => {
  const address = query.address.toLowerCase()
  const relations = toRelations(query)
  const anyOf = query.resolvesTo
    ? [{ resolvedAddress: address }]
    : [
        ...(relations.includes('owner') || relations.includes('manager')
          ? [{ owner: address }]
          : []),
        ...(relations.includes('role_holder') && roleNames.length > 0
          ? [{ name_in: roleNames }]
          : []),
      ]
  if (anyOf.length === 0) return null
  const { sort, order } = toOrder(query)
  return {
    where: {
      or: anyOf,
      ...toTextFilter(query),
      ...(query.migratedOnly && { isMigrated: true }),
      // Direct children are kept by `isChildOf` after the read.
      ...(query.parent && { name_ends_with: `.${query.parent}` }),
    },
    first: pageSize,
    after,
    orderBy: V2_SORT[sort],
    orderDirection: order,
  }
}

/** ENSNode filter for one page of ENSv1 names; null when no ENSv1 name can match. */
export const toV1Variables = (
  query: NamesForAddressQuery,
  skip: number,
  pageSize: number,
) => {
  if (query.migratedOnly) return null
  const address = query.address.toLowerCase()
  const relations = toRelations(query)
  // The wrapped owner both owns and manages; the registry owner manages, or owns an unwrapped subname.
  const anyOf = query.resolvesTo
    ? [{ resolvedAddress: address }]
    : [
        ...(relations.includes('owner') ? [{ registrant: address }] : []),
        ...(relations.includes('owner') || relations.includes('manager')
          ? [{ wrappedOwner: address }, { owner: address }]
          : []),
      ]
  if (anyOf.length === 0) return null
  const { sort, order } = toOrder(query)
  return {
    where: {
      or: anyOf,
      ...toTextFilter(query),
      ...(query.parent && { parent: namehash(query.parent) }),
    },
    first: pageSize,
    skip,
    orderBy: V1_SORT[sort],
    orderDirection: order,
  }
}

const compareValues = <T extends string | number>(a: T | null, b: T | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1

const SORT_KEYS = {
  name: (summary: NameSummary) => summary.name,
  expiry: (summary: NameSummary) => summary.expiresAt?.getTime() ?? null,
  registered: (summary: NameSummary) => summary.registeredAt?.getTime() ?? null,
  created: (summary: NameSummary) => summary.createdAt?.getTime() ?? null,
} as const

/** The order both sources were read in, to merge their pages by. */
export const toSummaryComparator = (query: NamesForAddressQuery) => {
  const { sort, order } = toOrder(query)
  const key: (summary: NameSummary) => string | number | null = SORT_KEYS[sort]
  const direction = order === 'asc' ? 1 : -1
  return (a: NameSummary, b: NameSummary) =>
    direction * compareValues(key(a), key(b))
}
